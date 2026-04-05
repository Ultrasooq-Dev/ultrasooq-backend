/**
 * @file chat.service.ts
 * @description Core business-logic service for the Ultrasooq chat module. Encapsulates
 * all persistence operations (rooms, messages, attachments, RFQ price requests) and
 * file-upload orchestration. Uses a module-scoped PrismaClient instance for database
 * access and an injected S3service for AWS S3 file operations.
 *
 * @module ChatService
 *
 * @dependencies
 * - {@link PrismaClient}                  -- Database ORM (module-scoped singleton).
 * - {@link S3service}                     -- AWS S3 upload and presigned-URL generation.
 * - {@link Server} (Socket.io)            -- Injected at runtime by ChatGateway for emitting events.
 * - Various DTOs for input validation.
 *
 * @dataflow
 * ChatController / ChatGateway --> ChatService --> PrismaClient (DB) / S3service (files)
 *                                             \--> Server.emit (real-time events)
 *
 * @notes
 * - The PrismaClient is instantiated at module scope (`const prisma = new PrismaClient()`),
 *   meaning a single connection pool is shared across all ChatService instances.
 * - The Socket.io Server reference is set post-construction via `setServer()`, called
 *   from {@link ChatGateway#afterInit}.
 * - All public methods follow the convention of returning either raw data or a
 *   `{ status, message?, data? }` response envelope.
 */
import { Injectable, NotFoundException, BadRequestException, HttpException, HttpStatus, UploadedFiles, Request, Body, ForbiddenException } from '@nestjs/common';
import { RfqProductPriceRequestStatus } from '../generated/prisma/client';
import { CreateRoomDto } from './dto/create-room.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateRfqPriceRequest } from './dto/updateRfqPriceRequest.dto';
import { UpdateRfqQuotesProductsOfferPrice } from './dto/updateRfqQuotesProductsOfferPrice.dto';
import { UpdateMessageStatus } from './dto/updateMessageStatus.dto';
import { SaveAttachmentsDto } from './dto/save-attachment.dto';
import { SelectSuggestedProductsDto } from './dto/select-suggested-products.dto';
import { S3service } from 'src/user/s3.service';
import { NotificationService } from 'src/notification/notification.service';
import { WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { CreateRoomOrderDto } from './dto/create-room-for-order.dto';
import { SendMessageForOrderDto } from './dto/send-message-for-order.dto';
import { PrismaService } from '../prisma/prisma.service';
import { getErrorMessage } from 'src/common/utils/get-error-message';


/**
 * @class ChatService
 * @description Injectable NestJS service containing all chat business logic:
 * room creation, message persistence, attachment management, RFQ price-request
 * workflows, product lookups, and file upload orchestration.
 *
 * @idea Keep all database and S3 interactions in one service so that both the
 * REST controller and WebSocket gateway share identical business rules.
 *
 * @usage Injected into {@link ChatController} and {@link ChatGateway} via NestJS DI.
 */
@Injectable()
export class ChatService {
    /** @description Socket.io server instance; set at runtime via {@link setServer}. */
    @WebSocketServer()
    server: Server;

    /**
     * @constructor
     * @description Injects the S3 file-storage service.
     * @param {S3service} s3service - AWS S3 wrapper for upload and presigned URL operations.
     */
    constructor(
        private readonly s3service: S3service,
        private readonly notificationService: NotificationService,
        private readonly prisma: PrismaService,
    ) { }

    /**
     * @method setServer
     * @description Stores the Socket.io Server reference so the service can emit
     * WebSocket events (e.g., `newAttachment`) outside of gateway event handlers.
     *
     * @intent Decouple real-time event emission from the gateway so that HTTP-triggered
     *         flows (file upload) can also broadcast to rooms.
     * @idea Called once from {@link ChatGateway#afterInit} after the WebSocket server
     *       has been fully initialised.
     * @usage `this.chatService.setServer(this.server);`
     * @dataflow ChatGateway.afterInit --> setServer(server).
     * @dependencies None.
     * @notes Must be invoked before any method that emits socket events (e.g., `uploadAttachment`).
     *
     * @param {Server} server - The Socket.io Server instance.
     * @returns {void}
     */
    setServer(server: Server) {
        this.server = server;
    }

    /**
     * @method mapStatus
     * @description Converts a single-character status code to the corresponding Prisma
     * `RfqProductPriceRequestStatus` enum value.
     *
     * @intent Translate compact client-facing status codes ("A", "R", "P") into the
     *         database enum representation.
     * @idea Acts as a lookup / validation layer; throws if the code is unrecognised.
     * @usage Called internally by `updateRfqPriceRequestStatus`.
     * @dataflow String code --> Prisma enum value.
     * @dependencies {@link RfqProductPriceRequestStatus} Prisma enum.
     * @notes Throws `BadRequestException` for unknown status strings.
     *
     * @param {string} status - One of "A" (Approved), "R" (Rejected), "P" (Pending).
     * @returns {RfqProductPriceRequestStatus} The mapped enum value.
     * @throws {BadRequestException} If the status string is not recognised.
     * @private
     */
    private mapStatus(status: string): RfqProductPriceRequestStatus {
        switch (status) {
            case 'A':
                return RfqProductPriceRequestStatus.APPROVED;
            case 'R':
                return RfqProductPriceRequestStatus.REJECTED;
            case 'P':
                return RfqProductPriceRequestStatus.PENDING;
            default:
                throw new BadRequestException(`Invalid status value: ${status}`);
        }
    }

    /**
     * @method sendMessage
     * @description Creates a new chat message in the database and, when applicable,
     * creates an associated RFQ quote-product price-request record.
     *
     * @intent Persist a user's message in an RFQ chat room. If the message includes
     *         price-negotiation fields (`rfqQuoteProductId`, `rfqQuotesUserId`), a
     *         corresponding `rfqQuoteProductPriceRequest` record is also created so
     *         the counterparty can approve or reject the requested price.
     * @idea Combines message creation and optional price-request creation in a single
     *       service call to keep the gateway/controller logic lean.
     * @usage Called from `ChatController.sendMessage` (REST) and `ChatGateway.handleMessage` /
     *        `ChatGateway.handleCreateRoom` (WebSocket).
     * @dataflow
     *   1. Prisma `message.create` with user include.
     *   2. (Conditional) Prisma `rfqQuoteProductPriceRequest.create`.
     *   3. Prisma `roomParticipants.findMany` to collect participant user IDs.
     *   4. Returns merged object with message, rfqPPRequest, and participant IDs.
     * @dependencies Prisma models: `message`, `rfqQuoteProductPriceRequest`, `roomParticipants`.
     * @notes
     * - `readStatusData` is computed but not currently persisted (prepared for future
     *   read-receipt tracking at the message level).
     * - The returned `participants` array includes ALL room members (including the sender).
     *
     * @param {SendMessageDto} sendMessageDto - Validated message payload.
     * @returns {Promise<object>} The created message augmented with `rfqPPRequest`,
     *          `rfqQuotesUserId`, and `participants` array.
     */
    async sendMessage(sendMessageDto: SendMessageDto) {
        const { 
            content, 
            userId, 
            roomId, 
            rfqId, 
            requestedPrice, 
            rfqQuoteProductId, 
            buyerId, 
            sellerId, 
            rfqQuotesUserId,
            suggestForRfqQuoteProductId,
            suggestedProducts
        } = sendMessageDto;
        let rfqPPRequest = null;
        let rfqSuggestedProducts = [];
        const message = await this.prisma.message.create({
            data: {
                content: content || "",
                userId,
                roomId,
                rfqId,
                rfqQuotesUserId
            },
            include: {
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        accountName: true,
                    }
                }
            },
        });

        if (rfqQuoteProductId && rfqQuotesUserId) {
            // Check if this is the first vendor price request for this product
            // Get the RFQ quote user to determine if requester is seller
            const rfqQuoteUser = await this.prisma.rfqQuotesUsers.findUnique({
                where: { id: rfqQuotesUserId },
                select: { sellerID: true, buyerID: true },
            });

            // Check if there are any existing approved price requests for this product
            const existingApprovedRequests = await this.prisma.rfqQuoteProductPriceRequest.findFirst({
                where: {
                    rfqQuoteProductId: rfqQuoteProductId,
                    rfqQuotesUserId: rfqQuotesUserId,
                    status: RfqProductPriceRequestStatus.APPROVED,
                },
            });

            // Auto-approve if:
            // 1. This is from the vendor (seller)
            // 2. No approved price requests exist yet (first vendor offer)
            const isVendorRequest = rfqQuoteUser?.sellerID === userId;
            const isFirstVendorOffer = !existingApprovedRequests && isVendorRequest;
            
            const initialStatus = isFirstVendorOffer 
                ? RfqProductPriceRequestStatus.APPROVED 
                : RfqProductPriceRequestStatus.PENDING;

            const approvedById = isFirstVendorOffer ? buyerId || null : null;

            const res = await this.prisma.rfqQuoteProductPriceRequest.create({
                data: {
                    rfqQuoteProductId: rfqQuoteProductId,
                    rfqQuotesUserId,
                    messageId: message.id,
                    requestedById: userId,
                    requestedPrice: requestedPrice,
                    buyerId: buyerId || null,
                    sellerId: sellerId || null,
                    rfqQuoteId: rfqId || null,
                    status: initialStatus,
                    approvedById: approvedById,
                },
            });

            // If auto-approved, update the product offer price and calculate total
            if (isFirstVendorOffer && res.status === RfqProductPriceRequestStatus.APPROVED) {
                await this.prisma.rfqQuotesProducts.update({
                    where: { id: rfqQuoteProductId },
                    data: { offerPrice: requestedPrice },
                });

                // Calculate total offer price for all products in this RFQ quote
                const allProducts = await this.prisma.rfqQuotesProducts.findMany({
                    where: {
                        rfqQuotesId: rfqId,
                        status: 'ACTIVE',
                    },
                });

                let totalOfferPrice = 0;
                for (const product of allProducts) {
                    // Check if this product has an approved price request
                    const approvedRequest = await this.prisma.rfqQuoteProductPriceRequest.findFirst({
                        where: {
                            rfqQuoteProductId: product.id,
                            rfqQuotesUserId: rfqQuotesUserId,
                            status: RfqProductPriceRequestStatus.APPROVED,
                        },
                        orderBy: { updatedAt: 'desc' },
                    });

                    if (approvedRequest) {
                        totalOfferPrice += approvedRequest.requestedPrice * (product.quantity || 1);
                    } else if (product.offerPrice) {
                        totalOfferPrice += Number(product.offerPrice) * (product.quantity || 1);
                    }
                }

                // Update the total offer price in RfqQuotesUsers
                await this.prisma.rfqQuotesUsers.update({
                    where: { id: rfqQuotesUserId },
                    data: { offerPrice: totalOfferPrice },
                });
            }

            rfqPPRequest = {
                id: res.id,
                requestedPrice: res.requestedPrice,
                status: res.status,
                rfqQuoteProductId: res.rfqQuoteProductId,
                requestedById: res.requestedById,
                approvedById: res.approvedById,
                updatedAt: res.updatedAt
            }
        }

        // NEW: Handle product suggestions (only for SIMILAR product type)
        if (suggestForRfqQuoteProductId && suggestedProducts && suggestedProducts.length > 0 && rfqQuotesUserId) {
            // Verify the product type is SIMILAR
            const rfqProduct = await this.prisma.rfqQuotesProducts.findUnique({
                where: { id: suggestForRfqQuoteProductId },
                select: { productType: true, quantity: true },
            });

            if (!rfqProduct || rfqProduct.productType !== 'SIMILAR') {
                throw new BadRequestException('Product suggestions are only allowed for SIMILAR product type');
            }

            // Verify vendor has access to this RFQ
            const rfqQuoteUser = await this.prisma.rfqQuotesUsers.findUnique({
                where: { id: rfqQuotesUserId },
                select: { sellerID: true, buyerID: true },
            });

            if (rfqQuoteUser?.sellerID !== userId) {
                throw new ForbiddenException('Only the vendor can suggest products');
            }

            // Create suggested products linked to this message
            const createdSuggestions = await Promise.all(
                suggestedProducts.map(async (suggestion) => {
                    // Verify the suggested product belongs to the vendor
                    const product = await this.prisma.product.findFirst({
                        where: {
                            id: suggestion.suggestedProductId,
                            userId: userId,
                            status: 'ACTIVE',
                            deletedAt: null,
                        },
                    });

                    if (!product) {
                        throw new BadRequestException(`Product ${suggestion.suggestedProductId} not found or not owned by vendor`);
                    }

                    return await this.prisma.rfqSuggestedProduct.create({
                        data: {
                            messageId: message.id,
                            rfqQuoteProductId: suggestForRfqQuoteProductId,
                            suggestedProductId: suggestion.suggestedProductId,
                            vendorId: userId,
                            rfqQuotesUserId: rfqQuotesUserId,
                            offerPrice: suggestion.offerPrice ? parseFloat(suggestion.offerPrice.toString()) : null,
                            quantity: suggestion.quantity || rfqProduct.quantity || 1,
                        },
                        include: {
                            suggestedProduct: {
                                include: {
                                    product_productPrice: {
                                        where: { status: 'ACTIVE' },
                                        take: 1,
                                    },
                                    productImages: { take: 1 },
                                    category: {
                                        select: { id: true, name: true },
                                    },
                                    brand: {
                                        select: { id: true, brandName: true },
                                    },
                                },
                            },
                            rfqQuoteProduct: {
                                select: {
                                    id: true,
                                    productType: true,
                                },
                            },
                        },
                    });
                })
            );

            rfqSuggestedProducts = createdSuggestions;
        }

        const roomParticipants = await this.prisma.roomParticipants.findMany({
            where: { roomId },
            select: { userId: true },
        });

        const readStatusData = roomParticipants
            .filter(participant => participant.userId !== userId)
            .map(participant => ({
                messageId: message.id,
                userId: participant.userId,
            }));

        return {
            ...message,
            rfqPPRequest,
            rfqSuggestedProducts,
            rfqQuotesUserId,
            participants: roomParticipants.map((participant) => participant.userId)
        };
    }

    /**
     * @method saveAttachmentMessage
     * @description Bulk-inserts chat attachment draft records into the database.
     *
     * @intent Persist metadata for one or more file attachments that accompany a chat
     *         message. The actual binary upload to S3 happens later via the
     *         `/upload-attachment` REST endpoint; these records act as placeholders
     *         (status = PENDING) until the upload completes.
     * @idea Decouples the message-send flow from the potentially slow file-upload flow:
     *       the message and attachment metadata are saved immediately, and the file is
     *       uploaded asynchronously.
     * @usage Called from `ChatGateway.handleMessage`, `handleCreateRoom`,
     *        `handleCreatePrivateRoomForOrder`, and `handleSendMessageForOrder`.
     * @dataflow DTO attachments array --> Prisma `chatAttachments.createMany` (skip duplicates).
     * @dependencies Prisma model: `chatAttachments`.
     * @notes
     * - `skipDuplicates: true` prevents errors if the same attachment is sent twice.
     * - Returns the Prisma `BatchPayload` (count of created records), not the records themselves.
     *
     * @param {SaveAttachmentsDto} saveAttachmentsDto - Object containing an array of attachment metadata.
     * @returns {Promise<import('@prisma/client').Prisma.BatchPayload>} Count of created attachment records.
     */
    async saveAttachmentMessage(saveAttachmentsDto: SaveAttachmentsDto) {
        const { attachments } = saveAttachmentsDto;

        const createdAttachments = await this.prisma.chatAttachments.createMany({
            data: attachments.map(attachment => ({
                fileName: attachment.fileName,
                filePath: attachment.filePath,
                fileSize: attachment.fileSize,
                fileType: attachment.fileType,
                fileExtension: attachment.fileExtension,
                messageId: attachment.messageId,
                status: attachment.status,
                uniqueId: attachment.uniqueId
            })),
            skipDuplicates: true,
        });

        return createdAttachments;
    }

    /**
     * @method getRoomsForUser
     * @description Retrieves all room IDs that a given user participates in.
     *
     * @intent Provide the WebSocket gateway with the list of rooms a user should be
     *         auto-joined to upon connection, ensuring they receive real-time messages
     *         for all their conversations.
     * @idea Queries `roomParticipants` by userId and extracts just the roomId values.
     * @usage Called from {@link ChatGateway#handleConnection} during socket handshake.
     * @dataflow userId --> Prisma `roomParticipants.findMany` --> array of room IDs.
     * @dependencies Prisma model: `roomParticipants`.
     * @notes Returns an empty array on error to avoid breaking the connection flow.
     *
     * @param {number} userId - The authenticated user's ID.
     * @returns {Promise<number[]>} Array of room IDs the user belongs to.
     */
    async getRoomsForUser(userId: number) {
        try {
            const roomParticipants = await this.prisma.roomParticipants.findMany({
                where: { userId },
                select: { roomId: true },
            });
            const roomIds = roomParticipants.map((participant) => participant.roomId);
            return roomIds;
        } catch (error) {
            return []
        }
    }

    /**
     * @method createRoom
     * @description Creates a new private chat room linked to an RFQ.
     *
     * @intent Establish a dedicated conversation space between buyer(s) and seller(s)
     *         for negotiating a specific RFQ.
     * @idea The room record stores the creator and RFQ reference; participant records
     *       are created in the same transaction via nested `create`.
     * @usage Called from `ChatController.createRoom` (REST) and `ChatGateway.handleCreateRoom` (WS).
     * @dataflow DTO --> Prisma `room.create` with nested `roomParticipants` --> room ID.
     * @dependencies Prisma models: `room`, `roomParticipants`.
     * @notes
     * - All participant user IDs (including the creator) must be included in the
     *   `participants` array to receive messages.
     * - Returns only the room ID (number), not the full room object.
     *
     * @param {CreateRoomDto} createRoomDto - Contains participants array, creatorId, and rfqId.
     * @returns {Promise<number>} The ID of the newly created room.
     */
    async createRoom(createRoomDto: CreateRoomDto): Promise<number> {
        const { participants, creatorId, rfqId } = createRoomDto;
        const room = await this.prisma.room.create({
            data: {
                creatorId,
                rfqId,
                participants: {
                    create: participants.map(userId => ({ userId })),
                },
            },
            include: { participants: true },
        });
        return room.id;
    }

    /**
     * @method createRoomForOrder
     * @description Creates a new private chat room linked to an order-product.
     *
     * @intent Establish a dedicated conversation space between buyer and seller for
     *         discussing a specific order-product item (post-purchase communication).
     * @idea Mirrors `createRoom` but associates the room with `orderProductId` instead
     *       of `rfqId`, reflecting the order lifecycle stage.
     * @usage Called from `ChatGateway.handleCreatePrivateRoomForOrder` (WebSocket).
     * @dataflow DTO --> Prisma `room.create` with nested `roomParticipants` --> room ID.
     * @dependencies Prisma models: `room`, `roomParticipants`.
     * @notes Returns only the room ID (number).
     *
     * @param {CreateRoomOrderDto} createRoomForOrderDto - Contains participants, creatorId, and orderProductId.
     * @returns {Promise<number>} The ID of the newly created room.
     */
    async createRoomForOrder(createRoomForOrderDto: CreateRoomOrderDto): Promise<number> {
        const { participants, creatorId, orderProductId } = createRoomForOrderDto;

        const room = await this.prisma.room.create({
            data: {
                creatorId,
                orderProductId,
                participants: {
                    create: participants.map(userId => ({ userId })),
                },
            },
            include: { participants: true },
        });

        return room.id;
    }

    /**
     * @method sendMessageForOrder
     * @description Creates a new chat message linked to an order-product conversation.
     *
     * @intent Persist a message within an order-product chat room, including the sender's
     *         user details and the list of room participants for real-time broadcasting.
     * @idea Mirrors `sendMessage` but stores `orderProductId` instead of `rfqId` and
     *       does not create any RFQ price-request records.
     * @usage Called from `ChatGateway.handleSendMessageForOrder` and
     *        `ChatGateway.handleCreatePrivateRoomForOrder`.
     * @dataflow
     *   1. Prisma `message.create` with user include and orderProductId.
     *   2. Prisma `roomParticipants.findMany` to collect participant user IDs.
     *   3. Returns merged object with message and participant IDs.
     * @dependencies Prisma models: `message`, `roomParticipants`.
     * @notes
     * - `readStatusData` is computed but not persisted (prepared for future use).
     * - The `rfqPPRequest` variable is declared but unused; kept for structural parity.
     *
     * @param {SendMessageForOrderDto} sendMessageForOrderDto - Validated order-message payload.
     * @returns {Promise<object>} Created message with `participants` array.
     */
    async sendMessageForOrder(sendMessageForOrderDto: SendMessageForOrderDto) {
        const { content, userId, roomId, orderProductId } = sendMessageForOrderDto;
        let rfqPPRequest = null;
        const message = await this.prisma.message.create({
            data: {
                content,
                userId,
                roomId,
                orderProductId
            },
            include: {
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                    }
                }
            },
        });

        const roomParticipants = await this.prisma.roomParticipants.findMany({
            where: { roomId: roomId },
            select: { userId: true },
        });

        const readStatusData = roomParticipants
            .filter(participant => participant.userId !== userId)
            .map(participant => ({
                messageId: message.id,
                userId: participant.userId,
            }));

        return {
            ...message,
            participants: roomParticipants.map((participant) => participant.userId)
        };
    }

    /**
     * @method findRoomWithBuyer
     * @description Finds an existing chat room for a given RFQ where a specific user
     * is a participant.
     *
     * @intent Allow the frontend to check for an existing room before creating a duplicate.
     * @idea Queries the `room` table filtering by `rfqId` and a participant match on `userId`.
     * @usage Called from `ChatController.checkRoom` (REST).
     * @dataflow (rfqId, userId) --> Prisma `room.findFirst` --> room ID or null.
     * @dependencies Prisma models: `room`, `roomParticipants`.
     * @notes Returns null when no matching room exists.
     *
     * @param {number} rfqId  - The RFQ ID associated with the room.
     * @param {number} userId - The participant user ID to match.
     * @returns {Promise<number | null>} The room ID if found, otherwise null.
     */
    async findRoomWithBuyer(rfqId: number, userId: number): Promise<number | null> {
        const room = await this.prisma.room.findFirst({
            where: {
                rfqId,
                participants: {
                    some: {
                        userId: userId,
                    },
                },
            },
            select: {
                id: true,
            },
        });
        return room ? room.id : null;
    }

    /**
     * @method findRoomForOrderWithBuyer
     * @description Finds an existing chat room for a given order-product where a specific
     * user is a participant.
     *
     * @intent Allow the frontend to check for an existing order-product chat room before
     *         creating a duplicate.
     * @idea Mirrors `findRoomWithBuyer` but filters by `orderProductId` instead of `rfqId`.
     * @usage Called from `ChatController.findRoomForOrderWithBuyer` (REST).
     * @dataflow (orderProductId, userId) --> Prisma `room.findFirst` --> room ID or null.
     * @dependencies Prisma models: `room`, `roomParticipants`.
     * @notes Returns null when no matching room exists.
     *
     * @param {number} orderProductId - The order-product ID associated with the room.
     * @param {number} userId         - The participant user ID to match.
     * @returns {Promise<number | null>} The room ID if found, otherwise null.
     */
    async findRoomForOrderWithBuyer(orderProductId: number, userId: number): Promise<number | null> {
        const room = await this.prisma.room.findFirst({
            where: {
                orderProductId,
                participants: {
                    some: {
                        userId: userId,
                    },
                },
            },
            select: {
                id: true,
            },
        });
        return room ? room.id : null;
    }

    /**
     * @method getMessagesByRoomId
     * @description Retrieves all messages for a given room, ordered chronologically,
     * with user details, RFQ price-request data, and attachment presigned URLs.
     *
     * @intent Provide the frontend with a complete, display-ready message list when
     *         a user opens a chat room, including time-limited S3 download URLs for
     *         any attachments.
     * @idea After fetching messages from the database, iterates over each attachment
     *       to generate a fresh presigned URL via S3service, ensuring links have not expired.
     * @usage Called from `ChatController.getMessages` (REST).
     * @dataflow
     *   1. Prisma `message.findMany` with includes (user, rfqProductPriceRequest, attachments).
     *   2. For each attachment with a `filePath`, generate presigned URL via S3service.
     *   3. Return the enriched messages array.
     * @dependencies Prisma model: `message`, {@link S3service#getPresignedUrl}.
     * @notes
     * - Presigned URLs are generated at read-time, so repeated calls produce fresh URLs.
     * - If presigned URL generation fails for an attachment, `presignedUrl` is set to null.
     *
     * @param {number} roomId - The chat room ID whose messages are requested.
     * @returns {Promise<any[]>} Array of message objects with resolved attachment URLs.
     */
    async getMessagesByRoomId(roomId: number): Promise<any[]> {
        const messages = await this.prisma.message.findMany({
            where: { roomId: roomId },
            orderBy: { createdAt: 'asc' },
            select: {
                id: true,
                content: true,
                createdAt: true,
                userId: true,
                roomId: true,
                rfqQuotesUserId: true,
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        accountName: true,
                        profilePicture: true,
                    }
                },
                rfqProductPriceRequest: {
                    select: {
                        id: true,
                        status: true,
                        requestedPrice: true,
                        rfqQuoteProductId: true,
                        requestedById: true
                    }
                },
                rfqSuggestedProducts: {
                    where: { deletedAt: null, status: 'ACTIVE' },
                    select: {
                        id: true,
                        messageId: true,
                        rfqQuoteProductId: true,
                        suggestedProductId: true,
                        vendorId: true,
                        rfqQuotesUserId: true,
                        offerPrice: true,
                        quantity: true,
                        isSelectedByBuyer: true,
                        createdAt: true,
                        updatedAt: true,
                        suggestedProduct: {
                            include: {
                                product_productPrice: {
                                    where: { status: 'ACTIVE' },
                                    take: 1,
                                },
                                productImages: { take: 3 },
                                category: {
                                    select: { id: true, name: true },
                                },
                                brand: {
                                    select: { id: true, brandName: true },
                                },
                            },
                        },
                        rfqQuoteProduct: {
                            select: {
                                id: true,
                                productType: true,
                            },
                        },
                        vendor: {
                            select: {
                                id: true,
                                accountName: true,
                                profilePicture: true,
                            },
                        },
                    },
                },
                attachments: {
                    select: {
                        id: true,
                        status: true,
                        fileName: true,
                        filePath: true,
                        presignedUrl: true,
                        fileType: true
                    }
                }
            }
        });

        const updatedMessages = await Promise.all(messages.map(async (message) => {
            if (message.attachments) {
                message.attachments = await Promise.all(message.attachments.map(async (attachment) => {
                    if (attachment.filePath) {
                        const presignedUrl = await this.s3service.getPresignedUrl(attachment.filePath);;
                        if (presignedUrl) attachment.presignedUrl = presignedUrl
                        else attachment.presignedUrl = null
                    }
                    return attachment;
                }));
            }
            return message;
        }));

        return updatedMessages;
    }

    /**
     * @method updateRfqPriceRequestStatus
     * @description Updates the approval status of an RFQ quote-product price request.
     *
     * @intent Allow a buyer or seller to approve or reject a price-change request
     *         initiated during an RFQ negotiation chat.
     * @idea Maps the single-character status code to the Prisma enum via `mapStatus`,
     *       determines `approvedById` or `rejectedById` based on the new status, and
     *       performs the update.
     * @usage Called from `ChatController.updateStatus` (REST) and
     *        `ChatGateway.handleUpdateRfqRequestPrice` (WebSocket).
     * @dataflow
     *   1. Validate existence via Prisma `rfqQuoteProductPriceRequest.findUnique`.
     *   2. Map status string --> Prisma enum.
     *   3. Prisma `rfqQuoteProductPriceRequest.update` with mapped status and user IDs.
     * @dependencies Prisma model: `rfqQuoteProductPriceRequest`, {@link mapStatus}.
     * @notes
     * - Throws `NotFoundException` if the price-request record does not exist.
     * - Wraps all errors in a generic 500 HttpException.
     *
     * @param {UpdateRfqPriceRequest} updateRfqPriceRequest - Contains id, status code, userId, roomId, etc.
     * @returns {Promise<object>} The updated rfqQuoteProductPriceRequest record.
     * @throws {HttpException} 500 on any error.
     */
    async updateRfqPriceRequestStatus(updateRfqPriceRequest: UpdateRfqPriceRequest) {
        try {
            const { id, status, userId } = updateRfqPriceRequest;
            const mappedStatus = this.mapStatus(status);
            let approvedById: number | null = null;
            let rejectedById: number | null = null;

            const rfq = await this.prisma.rfqQuoteProductPriceRequest.findUnique({
                where: { id },
                include: {
                    rfqQuoteProduct: {
                        include: {
                            rfqQuotesDetail: {
                                select: {
                                    id: true,
                                    buyerID: true,
                                },
                            },
                        },
                    },
                },
            });

            if (!rfq) {
                throw new NotFoundException(`RfqQuoteProductPriceRequest with ID ${id} not found`);
            }

            if (status === "A") {
                approvedById = userId
            } else if (status === "R") {
                rejectedById = userId
            }
            
            const updatedRfq = await this.prisma.rfqQuoteProductPriceRequest.update({
                where: { id },
                data: { status: mappedStatus, approvedById, rejectedById },
            });

            // Notify buyer about RFQ quote status change
            if ((status === "A" || status === "R") && rfq.rfqQuoteProduct?.rfqQuotesDetail?.buyerID) {
                try {
                    const buyerId = rfq.rfqQuoteProduct.rfqQuotesDetail.buyerID;
                    const rfqId = rfq.rfqQuoteProduct.rfqQuotesDetail.id;
                    
                    if (status === "A") {
                        await this.notificationService.createNotification({
                            userId: buyerId,
                            type: 'RFQ',
                            title: 'RFQ Quote Accepted',
                            message: 'Your RFQ quote has been accepted by the buyer',
                            data: {
                                rfqId,
                                rfqRequestId: id,
                                status: 'accepted',
                            },
                            link: `/rfq-quotes`,
                            icon: '✅',
                        });
                    } else if (status === "R") {
                        await this.notificationService.createNotification({
                            userId: buyerId,
                            type: 'RFQ',
                            title: 'RFQ Quote Rejected',
                            message: 'Your RFQ quote has been rejected',
                            data: {
                                rfqId,
                                rfqRequestId: id,
                                status: 'rejected',
                            },
                            link: `/rfq-quotes`,
                            icon: '❌',
                        });
                    }
                } catch (notificationError) {
                }
            }

            return updatedRfq;
        } catch (error) {
            throw new HttpException({
                status: HttpStatus.INTERNAL_SERVER_ERROR,
                error: 'Internal server error',
            }, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * @method updateRfqQuotesProductsOfferPrice
     * @description Recalculates and updates the total offer price for an RFQ quote user
     * when a product's negotiated price is approved.
     *
     * @intent When a price-request is approved, the RFQ user's aggregate `offerPrice`
     *         must be recalculated to reflect the new per-product price multiplied by
     *         quantity, replacing the previous amount.
     * @idea
     *   1. Fetch the current product record and the parent RFQ user's total.
     *   2. Look up the most recently approved price-request for this product + user
     *      combination (if any) to determine the "old" per-unit price.
     *   3. Subtract the old product total from the user's aggregate.
     *   4. Add the new product total (new offerPrice * quantity).
     *   5. Persist the updated aggregate back to `rfqQuotesUsers`.
     * @usage Called from `ChatGateway.handleUpdateRfqRequestPrice` when status is "A" (Approved).
     * @dataflow
     *   1. Prisma `rfqQuotesProducts.findUnique` --> product record.
     *   2. Prisma `rfqQuotesUsers.findUnique` --> current total offer.
     *   3. Prisma `rfqQuoteProductPriceRequest.findFirst` (latest APPROVED) --> previous price.
     *   4. Arithmetic: subtract old total, add new total.
     *   5. Prisma `rfqQuotesUsers.update` --> persist new aggregate.
     * @dependencies Prisma models: `rfqQuotesProducts`, `rfqQuotesUsers`,
     *               `rfqQuoteProductPriceRequest`.
     * @notes
     * - Throws `NotFoundException` if the product or quantity is missing.
     * - If `subtractedTotalAmount` goes negative, the absolute value is used.
     * - Errors are caught and logged to console; no HttpException is thrown.
     *
     * @param {UpdateRfqQuotesProductsOfferPrice} updateRfqQuotesProductsOfferPrice - Contains product id, rfqUserId, and new offerPrice.
     * @returns {Promise<{ newTotalOfferPrice: number }>} The recalculated total offer price.
     */
    async updateRfqQuotesProductsOfferPrice(updateRfqQuotesProductsOfferPrice: UpdateRfqQuotesProductsOfferPrice) {
        try {
            const { id, offerPrice, rfqUserId } = updateRfqQuotesProductsOfferPrice;

            const rfq = await this.prisma.rfqQuotesProducts.findUnique({
                where: { id },
            });

            const rfqUser = await this.prisma.rfqQuotesUsers.findUnique({
                where: { id: rfqUserId },
                select: {
                    id: true,
                    offerPrice: true
                }
            });

            const isAlreadyPriceRequested = await this.prisma.rfqQuoteProductPriceRequest.findFirst({
                where: {
                    rfqQuoteProductId: id,
                    rfqQuotesUserId: rfqUserId,
                    status: "APPROVED"
                },
                select: {
                    id: true,
                    requestedPrice: true
                },
                orderBy: {
                    id: "desc"
                }
            });
            if (!rfq) {
                throw new NotFoundException(`RfqQuotesProducts with ID ${id} not found`);
            }

            if (rfq.quantity) {
                let requestedProductTotal = 0;
                const currentTotalPrice: any = rfqUser.offerPrice;
                const requestedProductCurrentPrice: any = rfq?.offerPrice;

                if (isAlreadyPriceRequested?.requestedPrice) {
                    requestedProductTotal = isAlreadyPriceRequested?.requestedPrice * rfq.quantity
                } else {
                    requestedProductTotal = requestedProductCurrentPrice * rfq.quantity
                }

                // subtract the requested product total price from the total price
                let subtractedTotalAmount = currentTotalPrice - requestedProductTotal;
                if (subtractedTotalAmount < 0) {
                    subtractedTotalAmount = requestedProductTotal - currentTotalPrice;
                }
                // Addition the new requested price by the quantity
                const newRequestedTotalAmount = offerPrice * rfq.quantity;

                const newTotalAmount: number = subtractedTotalAmount + newRequestedTotalAmount;

                await this.prisma.rfqQuotesUsers.update({
                    where: { id: rfqUserId },
                    data: { offerPrice: newTotalAmount },
                });
                return {
                    newTotalOfferPrice: newTotalAmount
                }
            } else {
                throw new NotFoundException(`Quantity not found`);
            }
        } catch (error) {
        }
    }

    /**
     * @method markMessagesAsRead
     * @description Bulk-updates all UNREAD messages in a room for a specific user to READ status.
     *
     * @intent Support read-receipt / unread-badge functionality in the frontend by
     *         marking messages as read when a user opens or views a chat room.
     * @idea Validates the user exists, then uses `updateMany` with a compound WHERE clause
     *       (userId + roomId + status = UNREAD) for an efficient bulk update.
     * @usage Called from `ChatController.markMessagesAsRead` (REST).
     * @dataflow
     *   1. Prisma `user.findUnique` --> validate user.
     *   2. Prisma `message.updateMany` --> set status to READ.
     *   3. Return `{ status, message, data }` envelope.
     * @dependencies Prisma models: `user`, `message`.
     * @notes
     * - Throws a generic Error if the user is not found.
     * - Wraps all errors in a 500 HttpException.
     *
     * @param {UpdateMessageStatus} payload - Contains userId and roomId.
     * @returns {Promise<{ status: number; message: string; data: object }>} Envelope with batch-update result.
     * @throws {HttpException} 500 on any error.
     */
    async markMessagesAsRead(payload: UpdateMessageStatus) {
        try {
            const user = await this.prisma.user.findUnique({
                where: { id: payload.userId },
            });

            if (!user) {
                throw new Error('User not found');
            }

            const updatedMessages = await this.prisma.message.updateMany({
                where: {
                    userId: payload.userId,
                    roomId: payload.roomId,
                    status: 'UNREAD',
                },
                data: {
                    status: 'READ',
                },
            });

            return {
                status: HttpStatus.OK,
                message: 'Messages updated successfully',
                data: updatedMessages,
            };
        } catch (error) {
            throw new HttpException({
                status: HttpStatus.INTERNAL_SERVER_ERROR,
                error: 'Internal server error',
            }, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * @method getProductDetails
     * @description Fetches a lightweight projection of a product for display in the chat UI.
     *
     * @intent Provide the chat interface with enough product context (name, SKU, prices,
     *         primary image, cheapest seller admin ID) so the user can see what the
     *         conversation is about.
     * @idea Retrieves the product with its first active image and the lowest-priced
     *       active product-price record's admin detail.
     * @usage Called from `ChatController.getProduct` (REST).
     * @dataflow productId --> Prisma `product.findFirst` with nested selects --> `{ status, data }`.
     * @dependencies Prisma models: `product`, `productImages`, `product_productPrice`.
     * @notes
     * - Throws `NotFoundException` when the product is not found.
     * - Wraps all errors in a 500 HttpException.
     * - `product_productPrice` is sorted ascending by `offerPrice` and limited to 1.
     *
     * @param {number} productId - The product ID to look up.
     * @returns {Promise<{ status: number; data: object }>} Product details envelope.
     * @throws {HttpException} 500 on any error.
     */
    async getProductDetails(productId: number) {
        try {
            const product = await this.prisma.product.findFirst({
                where: { id: productId },
                orderBy: { createdAt: 'asc' },
                select: {
                    id: true,
                    productName: true,
                    skuNo: true,
                    productPrice: true,
                    offerPrice: true,
                    adminId: true,
                    userId: true,
                    productImages: {
                        where: {
                            status: "ACTIVE"
                        },
                        select: {
                            id: true,
                            image: true
                        },
                        take: 1
                    },
                    product_productPrice: {
                        where: {
                            status: 'ACTIVE',
                        },
                        select: {
                            adminDetail: {
                                select: {
                                    id: true
                                }
                            }
                        },
                        orderBy: {
                            offerPrice: 'asc'
                        },
                        take: 1
                    }
                }
            });
            if (!product) {
                throw new NotFoundException(`Product not found`);
            }

            return {
                status: HttpStatus.OK,
                data: product,
            };
        } catch (error) {
            throw new HttpException({
                status: HttpStatus.INTERNAL_SERVER_ERROR,
                error: 'Internal server error',
            }, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * @method getMessagesByUsers
     * @description Retrieves distinct buyer message threads for a specific product/RFQ,
     * excluding the seller's own messages, along with per-buyer unread message counts.
     *
     * @intent Show a seller the list of buyers who have initiated conversations about a
     *         product, together with unread message counts, enabling a seller inbox view.
     * @idea
     *   1. Fetch messages for the given `rfqId` (productId) where the sender is not the seller.
     *   2. Use `distinct: ['userId']` to get one message per unique buyer.
     *   3. For each buyer, count their unread messages to populate badge counts.
     * @usage Called from `ChatController.getMessage` (REST).
     * @dataflow
     *   1. Prisma `message.findMany` (distinct userId, include user + room).
     *   2. For each: Prisma `message.count` WHERE status = UNREAD.
     *   3. Return `{ status, data }` envelope.
     * @dependencies Prisma model: `message`.
     * @notes
     * - The `productId` parameter maps to `rfqId` in the message table.
     * - Wraps all errors in a 500 HttpException.
     *
     * @param {number} productId - The product/RFQ ID.
     * @param {number} sellerId  - The seller's user ID (excluded from results).
     * @returns {Promise<{ status: number; data: object[] }>} Envelope with buyer threads.
     * @throws {HttpException} 500 on any error.
     */
    async getMessagesByUsers(productId: number, sellerId: number) {
        try {
            const messages = await this.prisma.message.findMany({
                where: {
                    rfqId: productId,
                    rfqQuotesUserId: null, // Exclude RFQ messages - only product messages
                    userId: {
                        not: sellerId
                    }
                },
                distinct: ['userId'],
                orderBy: {
                    createdAt: 'desc',
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            accountName: true,
                            profilePicture: true
                        }
                    },
                    room: {
                        select: {
                            id: true
                        }
                    },
                }
            });

            const messagesWithMessageCount = await Promise.all(
                messages.map(async (message) => {
                    const unreadMsgCount = await this.prisma.message.count({
                        where: {
                            rfqId: productId,
                            rfqQuotesUserId: null, // Exclude RFQ messages - only product messages
                            userId: message.userId,
                            status: "UNREAD",
                        },
                    });

                    return {
                        ...message,
                        unreadMsgCount
                    };
                })
            );

            return {
                status: HttpStatus.OK,
                data: messagesWithMessageCount,
            };
        } catch (error) {
            throw new HttpException({
                status: HttpStatus.INTERNAL_SERVER_ERROR,
                error: 'Internal server error',
            }, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * @method getMessagesForOrderByorderProductId
     * @description Retrieves all messages for a given order-product conversation,
     * including user details and attachment metadata.
     *
     * @intent Provide the chat UI with the full message list for an order-product thread
     *         so buyer and seller can review their post-purchase communication.
     * @idea Fetches messages filtered by `orderProductId`, ordered descending by creation
     *       date, with includes for user, room, and attachments.
     * @usage Called from `ChatController.getMessageForOrder` (REST).
     * @dataflow orderProductId --> Prisma `message.findMany` with includes --> `{ status, data }`.
     * @dependencies Prisma model: `message`.
     * @notes
     * - The `sellerId` parameter is accepted but the seller-exclusion filter is currently
     *   commented out, so all messages are returned.
     * - Unread message count logic is also commented out (reserved for future use).
     * - Wraps all errors in a 500 HttpException.
     *
     * @param {number} orderProductId - The order-product ID.
     * @param {number} sellerId       - The seller's user ID (reserved for future filtering).
     * @returns {Promise<{ status: number; data: object[] }>} Envelope with messages.
     * @throws {HttpException} 500 on any error.
     */
    async getMessagesForOrderByorderProductId(orderProductId: number, sellerId: number) {
        try {
            const messages = await this.prisma.message.findMany({
                where: {
                    orderProductId: orderProductId,
                    // userId: {
                    //     not: sellerId
                    // }
                },
                // distinct: ['userId'],
                orderBy: {
                    createdAt: 'desc',
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            accountName: true,
                            profilePicture: true
                        }
                    },
                    room: {
                        select: {
                            id: true
                        }
                    },
                    attachments: {
                        select: {
                            id: true,
                            status: true,
                            fileName: true,
                            filePath: true,
                            presignedUrl: true,
                            fileType: true
                        }
                    }
                }
            });


            return {
                status: HttpStatus.OK,
                // data: messagesWithMessageCount,
                data: messages
            };
        } catch (error) {
            throw new HttpException({
                status: HttpStatus.INTERNAL_SERVER_ERROR,
                error: 'Internal server error',
            }, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * @method updateAttachmentStatus
     * @description Updates a chat attachment record from PENDING to UPLOADED and stores
     * the final S3 file path.
     *
     * @intent Transition an attachment from its draft/pending state to UPLOADED once the
     *         binary file has been successfully stored in S3, and return the metadata
     *         needed to emit a real-time notification.
     * @idea Looks up the attachment by its client-generated `uniqueId`, updates its status
     *       and path, then returns room/user metadata so the caller can broadcast a
     *       `newAttachment` socket event.
     * @usage Called internally from `uploadAttachment`.
     * @dataflow
     *   1. Prisma `chatAttachments.findUnique` (by uniqueId, include message + room).
     *   2. Prisma `chatAttachments.update` --> set status=UPLOADED, filePath=path.
     *   3. Return `{ status: 200, data: { roomId, senderId, uniqueId, ... } }`.
     * @dependencies Prisma model: `chatAttachments`.
     * @notes
     * - Returns `{ status: 500 }` on error instead of throwing, so the caller can
     *   handle the failure gracefully.
     *
     * @param {{ uniqueId: string; path: string }} payload - The attachment's unique ID and S3 path.
     * @returns {Promise<{ status: number; data?: object }>} Status envelope with attachment metadata.
     */
    async updateAttachmentStatus(payload: { uniqueId: string, path: string }) {
        try {
            const attachment = await this.prisma.chatAttachments.findUnique({
                where: { uniqueId: payload.uniqueId },
                select: {
                    fileName: true,
                    fileType: true,
                    message: {
                        select: {
                            roomId: true,
                            userId: true,
                            room: {
                                select: {
                                    creatorId: true
                                }
                            }
                        }
                    }
                },
            });

            if (!attachment) {
                throw new Error('Attachment not found');
            }

            const updatedAttachment = await this.prisma.chatAttachments.update({
                where: {
                    uniqueId: payload.uniqueId,
                },
                data: {
                    status: 'UPLOADED',
                    filePath: payload.path
                },
            });
            return {
                status: 200,
                data: {
                    roomId: attachment.message.roomId.toString(),
                    senderId: attachment.message.userId,
                    uniqueId: updatedAttachment.uniqueId,
                    status: updatedAttachment.status,
                    messageId: updatedAttachment.messageId,
                    fileName: attachment.fileName,
                    fileType: attachment.fileType
                }
            };
        } catch (error) {
            return {
                status: 500
            }
        }
    }

    /**
     * @method uploadAttachment
     * @description Orchestrates the full file-upload flow: uploads to S3, updates the
     * attachment record, generates a presigned URL, and emits a `newAttachment`
     * WebSocket event to the chat room.
     *
     * @intent Allow authenticated users to upload a file attachment for a chat message.
     *         The file is stored in S3 under a user-namespaced path, and all room
     *         participants are notified in real time.
     * @idea
     *   1. Validate that the `content` file field is present.
     *   2. Construct an S3 path: `public/<userId>/<timestamp>_<originalname>`.
     *   3. Upload the buffer to S3 via S3service.
     *   4. Update the draft attachment record via `updateAttachmentStatus`.
     *   5. Generate a presigned download URL.
     *   6. Emit `newAttachment` to the room via the Socket.io server reference.
     * @usage Called from `ChatController.uploadAttachment` (REST, multipart/form-data).
     * @dataflow
     *   multipart file --> S3service.s3_upload --> updateAttachmentStatus (Prisma)
     *   --> S3service.getPresignedUrl --> Server.emit('newAttachment') --> response envelope.
     * @dependencies {@link S3service#s3_upload}, {@link S3service#getPresignedUrl},
     *               {@link updateAttachmentStatus}, Socket.io `Server`.
     * @notes
     * - Requires `payload.uniqueId` to match the draft attachment created during message send.
     * - Returns 400 if no file or uniqueId is provided.
     * - Returns 500 if the attachment status update fails.
     * - Throws `HttpException` 500 on unexpected errors.
     *
     * @param {object} files   - Uploaded files keyed by field name (expects `content`).
     * @param {object} req     - Express request with `req.user.id` from AuthGuard.
     * @param {any}    payload - Body payload containing `uniqueId`.
     * @returns {Promise<object>} Status envelope indicating success or failure.
     * @throws {HttpException} 500 on unexpected errors.
     */
    async uploadAttachment(@UploadedFiles() files, @Request() req, @Body() payload: any) {
        try {
            if (files.content) {
                const currentFile = Date.now() + "_" + files?.content[0]?.originalname
                const path = "public/" + req.user.id + "/" + currentFile
                await this.s3service.s3_upload(files.content[0].buffer, path, files.content[0].mimetype, files.content[0]);

                if (payload?.uniqueId) {
                    const res = await this.updateAttachmentStatus({ uniqueId: payload?.uniqueId, path: path });
                    if (res?.status !== 500 && res?.data) {
                        ///Emit socket event after successful update
                        const presignedUrl = await this.s3service.getPresignedUrl(path);

                        this.server.to(res?.data?.roomId).emit('newAttachment', {
                            uniqueId: res?.data.uniqueId,
                            status: res?.data.status,
                            messageId: res?.data.messageId,
                            roomId: res?.data.roomId,
                            senderId: res?.data.senderId,
                            fileName: res?.data.fileName,
                            fileType: res?.data.fileType,
                            filePath: path,
                            presignedUrl
                        });
                        return {
                            status: HttpStatus.OK,
                            message: 'Uploading completed',
                        };
                    }
                    return {
                        status: HttpStatus.INTERNAL_SERVER_ERROR,
                        error: 'Internal server error',
                    };
                }
                return {
                    status: HttpStatus.BAD_REQUEST,
                    error: 'UniqueId is required',
                };
            } else {
                return {
                    status: HttpStatus.BAD_REQUEST,
                    error: 'attachment not found',
                };
            }
        } catch (error) {
            throw new HttpException({
                status: HttpStatus.INTERNAL_SERVER_ERROR,
                error: 'Internal server error',
            }, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async getAllProductsWithMessages(sellerId: number) {
        try {
            // Get all rooms where seller is a participant
            const sellerRooms = await this.prisma.roomParticipants.findMany({
                where: {
                    userId: sellerId
                },
                include: {
                    room: {
                        include: {
                            messages: {
                                where: {
                                    rfqId: { not: null }, // Product ID (not RFQ quote ID)
                                    rfqQuotesUserId: null, // Exclude RFQ messages - only product messages
                                    userId: { not: sellerId } // Only messages from buyers
                                },
                                orderBy: {
                                    createdAt: 'desc'
                                },
                                take: 1,
                                include: {
                                    user: {
                                        select: {
                                            id: true,
                                            firstName: true,
                                            lastName: true,
                                            accountName: true,
                                            email: true,
                                            profilePicture: true
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });

            // Filter rooms that have product messages (rfqId is not null but rfqQuotesUserId is null)
            // This excludes RFQ messages which have rfqQuotesUserId set
            const productRooms = sellerRooms.filter(
                roomParticipant => 
                    roomParticipant.room.rfqId !== null && 
                    roomParticipant.room.messages.length > 0 &&
                    roomParticipant.room.messages[0]?.rfqQuotesUserId === null
            );

            // Group by product (rfqId) + user combination using roomId as unique key
            // Each room represents a unique conversation between seller and a specific user about a product
            const roomMap = new Map<number, any>();

            for (const roomParticipant of productRooms) {
                const room = roomParticipant.room;
                const rfqId = room.rfqId!;
                const latestMessage = room.messages[0];

                // Use roomId as the key since each room is unique per user-product combination
                if (!roomMap.has(room.id)) {
                    // Get unread count for this specific room (only product messages, not RFQ)
                    const unreadCount = await this.prisma.message.count({
                        where: {
                            roomId: room.id,
                            userId: { not: sellerId },
                            status: "UNREAD",
                            rfqQuotesUserId: null // Exclude RFQ messages
                        }
                    });

                    roomMap.set(room.id, {
                        productId: rfqId,
                        roomId: room.id,
                        userId: latestMessage.userId,
                        user: latestMessage.user,
                        lastMessage: latestMessage.content,
                        lastMessageTime: latestMessage.createdAt,
                        unreadMsgCount: unreadCount
                    });
                } else {
                    // Update if this message is newer
                    const existing = roomMap.get(room.id)!;
                    if (latestMessage.createdAt > existing.lastMessageTime) {
                        // Get unread count for this specific room (only product messages, not RFQ)
                        const unreadCount = await this.prisma.message.count({
                            where: {
                                roomId: room.id,
                                userId: { not: sellerId },
                                status: "UNREAD",
                                rfqQuotesUserId: null // Exclude RFQ messages
                            }
                        });

                        roomMap.set(room.id, {
                            ...existing,
                            userId: latestMessage.userId,
                            user: latestMessage.user,
                            lastMessage: latestMessage.content,
                            lastMessageTime: latestMessage.createdAt,
                            unreadMsgCount: unreadCount
                        });
                    }
                }
            }

            // Convert map to array and sort by last message time
            const productsWithMessages = Array.from(roomMap.values()).sort(
                (a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
            );

            return {
                status: HttpStatus.OK,
                data: productsWithMessages
            };
        } catch (error) {
            throw new HttpException({
                status: HttpStatus.INTERNAL_SERVER_ERROR,
                error: 'Internal server error',
            }, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    // NEW: Select suggested products (Buyer action)
    async selectSuggestedProducts(payload: {
        selectedSuggestionIds: number[];
        buyerId: number;
        rfqQuoteProductId: number;
        rfqQuotesUserId: number;
    }) {
        try {
            // Verify buyer access
            const rfqQuoteUser = await this.prisma.rfqQuotesUsers.findUnique({
                where: { id: payload.rfqQuotesUserId },
                select: { buyerID: true },
            });

            if (rfqQuoteUser?.buyerID !== payload.buyerId) {
                throw new ForbiddenException('Buyer access denied');
            }

            // Verify all suggestions belong to the specified RFQ product
            const suggestions = await this.prisma.rfqSuggestedProduct.findMany({
                where: {
                    id: { in: payload.selectedSuggestionIds },
                    rfqQuoteProductId: payload.rfqQuoteProductId,
                    rfqQuotesUserId: payload.rfqQuotesUserId,
                    deletedAt: null,
                    status: 'ACTIVE',
                },
            });

            if (suggestions.length !== payload.selectedSuggestionIds.length) {
                throw new BadRequestException('Some suggested products not found or invalid');
            }

            // Unselect all suggestions for this RFQ product
            await this.prisma.rfqSuggestedProduct.updateMany({
                where: {
                    rfqQuoteProductId: payload.rfqQuoteProductId,
                    rfqQuotesUserId: payload.rfqQuotesUserId,
                    deletedAt: null,
                },
                data: { isSelectedByBuyer: false },
            });

            // Select the chosen ones
            if (payload.selectedSuggestionIds.length > 0) {
                await this.prisma.rfqSuggestedProduct.updateMany({
                    where: {
                        id: { in: payload.selectedSuggestionIds },
                    },
                    data: { isSelectedByBuyer: true },
                });
            }

            return {
                status: 200,
                message: 'Products selected successfully',
            };
        } catch (error) {
            if (error instanceof ForbiddenException || error instanceof BadRequestException) {
                throw error;
            }
            throw new HttpException({
                status: HttpStatus.INTERNAL_SERVER_ERROR,
                error: 'Internal server error',
            }, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    // NEW: Get vendor products for suggestion modal
    async getVendorProductsForSuggestion(vendorId: number, options: { page: number; limit: number; term?: string }) {
        try {
            const skip = (options.page - 1) * options.limit;

            const where: any = {
                userId: vendorId,
                status: 'ACTIVE',
                deletedAt: null,
            };

            if (options.term) {
                where.productName = { contains: options.term, mode: 'insensitive' };
            }

            const [products, total] = await Promise.all([
                this.prisma.product.findMany({
                    where,
                    skip,
                    take: options.limit,
                    include: {
                        product_productPrice: {
                            where: { status: 'ACTIVE' },
                            take: 1,
                        },
                        productImages: { take: 1 },
                        category: {
                            select: { id: true, name: true },
                        },
                        brand: {
                            select: { id: true, brandName: true },
                        },
                    },
                    orderBy: { createdAt: 'desc' },
                }),
                this.prisma.product.count({ where }),
            ]);

            return {
                status: 200,
                message: 'success',
                data: products,
                totalCount: total,
                page: options.page,
                limit: options.limit,
            };
        } catch (error) {
            throw new HttpException({
                status: HttpStatus.INTERNAL_SERVER_ERROR,
                error: 'Internal server error',
            }, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
}
