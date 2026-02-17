/**
 * @file chat.controller.ts
 * @description REST controller for the Ultrasooq chat module. Exposes HTTP endpoints
 * under the `/chat` route prefix for sending messages, creating rooms, fetching
 * message history, managing RFQ price-request statuses, uploading/downloading
 * attachments, and marking messages as read.
 *
 * All endpoints are protected by {@link AuthGuard} (JWT-based authentication).
 *
 * @module ChatController
 *
 * @dependencies
 * - {@link ChatService} -- Delegates every business operation to this service.
 * - {@link S3service}   -- Used directly only for generating presigned download URLs.
 * - {@link AuthGuard}   -- JWT guard applied to every route.
 *
 * @dataflow
 * Client (HTTP) --> ChatController --> ChatService --> PrismaClient / S3
 *
 * @notes
 * - The controller returns the standard `{ status, message, data }` envelope where
 *   applicable; some endpoints delegate envelope construction to the service layer.
 * - File uploads use `FileFieldsInterceptor` from `@nestjs/platform-express`.
 */
import { Controller, Get, Post, Body, Query, HttpException, HttpStatus, Put, Patch, UseGuards, UseInterceptors, UploadedFiles, Request, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateRfqPriceRequest } from './dto/updateRfqPriceRequest.dto';
import { ParseIntPipe } from '@nestjs/common';
import { UpdateMessageStatus } from './dto/updateMessageStatus.dto';
import { SelectSuggestedProductsDto } from './dto/select-suggested-products.dto';
import { AuthGuard } from 'src/guards/AuthGuard';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { S3service } from 'src/user/s3.service';
import { Throttle } from '@nestjs/throttler';

/**
 * @class ChatController
 * @description Handles all inbound HTTP requests for the chat feature. Each method
 * maps to a distinct REST endpoint and delegates to {@link ChatService}.
 *
 * @idea Keep the controller thin -- validate input via DTOs and pipes, then hand off
 * to the service for persistence and side-effects.
 *
 * @usage Registered automatically by {@link ChatModule}; clients access via `/chat/*`.
 */
@ApiTags('chat')
@ApiBearerAuth('JWT-auth')
@Controller('chat')
export class ChatController {
  @Get('test')
  testConnection() {
    return { 
      message: 'Backend is accessible',
      timestamp: new Date().toISOString(),
      socketNamespace: '/ws'
    };
  }

  /**
   * @constructor
   * @description Injects the chat business-logic service and the S3 file-storage service.
   *
   * @param {ChatService} chatService - Core chat operations (rooms, messages, RFQ updates).
   * @param {S3service} s3service     - AWS S3 helper for presigned URL generation.
   */
  constructor(
    private readonly chatService: ChatService,
    private readonly s3service: S3service
  ) { }

  /**
   * @method sendMessage
   * @description Persists a new chat message via the REST API.
   *
   * @intent Allow authenticated users to send a message to an existing chat room.
   * @idea Provides an HTTP alternative to the WebSocket `sendMessage` event so
   *       clients without a live socket connection can still send messages.
   * @usage `POST /chat/send-message` with a {@link SendMessageDto} body.
   * @dataflow Body DTO --> ChatService.sendMessage --> Prisma `message.create`.
   * @dependencies {@link ChatService#sendMessage}, {@link AuthGuard}.
   * @notes The response shape is determined by ChatService (includes user, participants, rfqPPRequest).
   *
   * @param {SendMessageDto} sendMessageDto - Validated message payload.
   * @returns {Promise<object>} The newly created message record with related data.
   */
  @UseGuards(AuthGuard)
  @Post('/send-message')
  async sendMessage(@Body() sendMessageDto: SendMessageDto) {
    const message = await this.chatService.sendMessage(sendMessageDto);
    return message;
  }

  /**
   * @method createRoom
   * @description Creates a new private chat room for an RFQ conversation.
   *
   * @intent Enable buyers and sellers to open a dedicated chat room linked to a specific RFQ.
   * @idea Each RFQ negotiation gets its own room so message history stays contextual.
   * @usage `POST /chat/createPrivateRoom` with a {@link CreateRoomDto} body.
   * @dataflow Body DTO --> ChatService.createRoom --> Prisma `room.create` with participants.
   * @dependencies {@link ChatService#createRoom}, {@link AuthGuard}.
   * @notes Returns only the new room ID; the caller must join the room via WebSocket separately.
   *
   * @param {CreateRoomDto} createRoomDto - Room creation payload including participants and RFQ reference.
   * @returns {Promise<{ id: number }>} Object containing the newly created room ID.
   */
  @UseGuards(AuthGuard)
  @Post('/createPrivateRoom')
  async createRoom(@Body() createRoomDto: CreateRoomDto): Promise<{ id: number }> {
    const roomId = await this.chatService.createRoom(createRoomDto);
    return { id: roomId };
  }

  /**
   * @method checkRoom
   * @description Looks up an existing chat room for a given RFQ and user combination.
   *
   * @intent Let the frontend check whether a room already exists before attempting to create one,
   *         avoiding duplicate rooms for the same RFQ conversation.
   * @idea Query by RFQ ID and participant user ID; return null when no room is found.
   * @usage `GET /chat/find-room?rfqId=<number>&userId=<number>`
   * @dataflow Query params --> ChatService.findRoomWithBuyer --> Prisma `room.findFirst`.
   * @dependencies {@link ChatService#findRoomWithBuyer}, {@link AuthGuard}.
   * @notes The query parameter is named `rfqId` but the controller variable is `creatorId`;
   *        this maps to the rfqId argument of the service method.
   *
   * @param {number} creatorId - The RFQ ID (parsed from query param `rfqId`).
   * @param {number} userId    - The participant (buyer) user ID.
   * @returns {Promise<{ roomId: number | null }>} The room ID if found, otherwise null.
   */
  @UseGuards(AuthGuard)
  @Get('find-room')
  async checkRoom(
    @Query('rfqId', ParseIntPipe) rfqId: number,
    @Query('userId', ParseIntPipe) userId: number,
  ): Promise<{ roomId: number | null }> {
    const roomId = await this.chatService.findRoomWithBuyer(rfqId, userId);
    return { roomId };
  }
  /**
   * @method findRoomForOrderWithBuyer
   * @description Looks up an existing chat room for a given order-product and user combination.
   *
   * @intent Allow the frontend to discover whether an order-specific chat room already exists.
   * @idea Mirrors `checkRoom` but scoped to order-product conversations instead of RFQ ones.
   * @usage `GET /chat/find-room-for-order?orderProductId=<number>&userId=<number>`
   * @dataflow Query params --> ChatService.findRoomForOrderWithBuyer --> Prisma `room.findFirst`.
   * @dependencies {@link ChatService#findRoomForOrderWithBuyer}, {@link AuthGuard}.
   * @notes Returns null when no matching room exists.
   *
   * @param {number} orderProductId - The order-product ID to search for.
   * @param {number} userId         - The participant (buyer) user ID.
   * @returns {Promise<{ roomId: number | null }>} The room ID if found, otherwise null.
   */
  @UseGuards(AuthGuard)
  @Get('find-room-for-order')
  async findRoomForOrderWithBuyer(
    @Query('orderProductId', ParseIntPipe) orderProductId: number,
    @Query('userId', ParseIntPipe) userId: number,
  ): Promise<{ roomId: number | null }> {
    const roomId = await this.chatService.findRoomForOrderWithBuyer(orderProductId, userId);
    return { roomId };
  }

  /**
   * @method getMessages
   * @description Retrieves the full message history for a specific chat room.
   *
   * @intent Provide the frontend with the complete, chronologically-ordered list of messages
   *         (including attachments with presigned S3 URLs) when a user opens a chat room.
   * @idea Messages are fetched in ascending creation order; attachment URLs are resolved
   *       at read-time so they remain fresh.
   * @usage `GET /chat/messages?roomId=<number>`
   * @dataflow Query param --> ChatService.getMessagesByRoomId --> Prisma + S3 presigned URL
   *          generation --> `{ status: 200, message, data }` envelope.
   * @dependencies {@link ChatService#getMessagesByRoomId}, {@link AuthGuard}.
   * @notes Wraps the service call in a try/catch and returns a 500 HttpException on failure.
   *
   * @param {number} roomId - The chat room whose messages are requested.
   * @returns {Promise<{ status: number; message: string; data: any[] }>} Envelope with message array.
   * @throws {HttpException} 500 when the service call fails.
   */
  @UseGuards(AuthGuard)
  @Get('/messages')
  async getMessages(@Query('roomId', ParseIntPipe) roomId: number) {
    try {
      const messages = await this.chatService.getMessagesByRoomId(roomId);
      return {
        status: 200,
        message: "success",
        data: messages
      };
    } catch (error) {
      throw new HttpException({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'Could not fetch messages',
      }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * @method updateStatus
   * @description Updates the status (Approved / Rejected / Pending) of an RFQ price request.
   *
   * @intent Allow a buyer or seller to approve or reject a negotiated price change on an
   *         RFQ quote product directly from the chat interface.
   * @idea Status transitions are validated by the service; the controller simply forwards the DTO.
   * @usage `PUT /chat/update-rfq-price-request-status` with an {@link UpdateRfqPriceRequest} body.
   * @dataflow Body DTO --> ChatService.updateRfqPriceRequestStatus --> Prisma update.
   * @dependencies {@link ChatService#updateRfqPriceRequestStatus}, {@link AuthGuard}.
   * @notes This is the REST equivalent of the WebSocket `updateRfqPriceRequest` event handler.
   *
   * @param {UpdateRfqPriceRequest} updateRfqPriceRequest - Payload containing the price-request ID and new status.
   * @returns {Promise<object>} The updated RfqQuoteProductPriceRequest record.
   */
  @UseGuards(AuthGuard)
  @Put('/update-rfq-price-request-status')
  async updateStatus(@Body() updateRfqPriceRequest: UpdateRfqPriceRequest) {
    return this.chatService.updateRfqPriceRequestStatus(updateRfqPriceRequest);
  }

  /**
   * @method markMessagesAsRead
   * @description Bulk-updates the status of all UNREAD messages in a room for a given user to READ.
   *
   * @intent Support read-receipt functionality so that unread message counts can be
   *         accurately displayed in the frontend chat list.
   * @idea Uses a PATCH verb because it partially updates existing message records.
   * @usage `PATCH /chat/read-messages` with an {@link UpdateMessageStatus} body.
   * @dataflow Body DTO --> ChatService.markMessagesAsRead --> Prisma `message.updateMany`.
   * @dependencies {@link ChatService#markMessagesAsRead}, {@link AuthGuard}.
   * @notes Returns a `{ status, message, data }` envelope with the Prisma batch-update result.
   *
   * @param {UpdateMessageStatus} payload - Contains userId and roomId to scope the update.
   * @returns {Promise<{ status: number; message: string; data: object }>} Update result envelope.
   */
  @UseGuards(AuthGuard)
  @Patch('/read-messages')
  async markMessagesAsRead(@Body() payload: UpdateMessageStatus) {
    return this.chatService.markMessagesAsRead(payload);
  }

  /**
   * @method getProduct
   * @description Fetches summary product details for display within the chat context.
   *
   * @intent Provide the chat UI with product metadata (name, SKU, price, image) so the user
   *         can see what product the conversation is about without leaving the chat view.
   * @idea Returns a lightweight product projection rather than the full product entity.
   * @usage `GET /chat/product?productId=<number>`
   * @dataflow Query param --> ChatService.getProductDetails --> Prisma `product.findFirst`.
   * @dependencies {@link ChatService#getProductDetails}, {@link AuthGuard}.
   * @notes Response is wrapped in a `{ status, data }` envelope by the service.
   *
   * @param {number} productId - The product to look up.
   * @returns {Promise<{ status: number; data: object }>} Product details envelope.
   */
  @UseGuards(AuthGuard)
  @Get('/product')
  async getProduct(@Query('productId', ParseIntPipe) productId: number) {
    return this.chatService.getProductDetails(productId);
  }

  /**
   * @method getMessage
   * @description Retrieves distinct user message threads for a product, excluding the seller.
   *
   * @intent Show a seller the list of buyers who have messaged about a specific product/RFQ,
   *         along with unread message counts per buyer.
   * @idea Groups messages by distinct userId (buyer) for the given product, filtering out
   *       the seller's own messages.
   * @usage `GET /chat/product/messages?productId=<number>&sellerId=<number>`
   * @dataflow Query params --> ChatService.getMessagesByUsers --> Prisma query with distinct userId.
   * @dependencies {@link ChatService#getMessagesByUsers}, {@link AuthGuard}.
   * @notes The `productId` maps to `rfqId` in the message table.
   *
   * @param {number} productId - The product/RFQ ID.
   * @param {number} sellerId  - The seller's user ID (excluded from results).
   * @returns {Promise<{ status: number; data: object[] }>} List of messages grouped by buyer.
   */
  @UseGuards(AuthGuard)
  @Get('/product/messages')
  async getMessage(
    @Query('productId', ParseIntPipe) productId: number,
    @Query('sellerId', ParseIntPipe) sellerId: number,
  ) {
    return this.chatService.getMessagesByUsers(productId, sellerId);
  }

  /**
   * @method getMessageForOrder
   * @description Retrieves all messages for an order-product conversation.
   *
   * @intent Provide the chat UI with the full message list for a particular order-product thread,
   *         including user details and attachment metadata.
   * @idea Similar to `getMessage` but scoped to order-product conversations rather than RFQ ones.
   * @usage `GET /chat/order/messages?orderProductId=<number>&sellerId=<number>`
   * @dataflow Query params --> ChatService.getMessagesForOrderByorderProductId --> Prisma query.
   * @dependencies {@link ChatService#getMessagesForOrderByorderProductId}, {@link AuthGuard}.
   * @notes The sellerId parameter is accepted but currently unused in the service query
   *        (commented-out filter).
   *
   * @param {number} orderProductId - The order-product ID.
   * @param {number} sellerId       - The seller's user ID (reserved for future filtering).
   * @returns {Promise<{ status: number; data: object[] }>} Messages envelope.
   */
  @UseGuards(AuthGuard)
  @Get('/order/messages')
  async getMessageForOrder(
    @Query('orderProductId', ParseIntPipe) orderProductId: number,
    @Query('sellerId', ParseIntPipe) sellerId: number,
  ) {
    return this.chatService.getMessagesForOrderByorderProductId(orderProductId, sellerId);
  }

  /**
   * @method uploadAttachment
   * @description Uploads a single file attachment to S3 and links it to a chat message.
   *
   * @intent Allow users to share files (images, documents) within a chat conversation.
   * @idea The file is uploaded to S3 under a user-specific path, then the corresponding
   *       `chatAttachments` record is updated with the S3 key. A WebSocket event
   *       (`newAttachment`) is emitted to notify other room participants in real time.
   * @usage `POST /chat/upload-attachment` as multipart/form-data with field `content` (single file)
   *        and a `uniqueId` body field.
   * @dataflow Multipart file --> S3service.s3_upload --> ChatService.updateAttachmentStatus
   *           --> WebSocket emit `newAttachment`.
   * @dependencies {@link ChatService#uploadAttachment}, {@link FileFieldsInterceptor}, {@link AuthGuard}.
   * @notes The interceptor limits the upload to one file in the `content` field.
   *
   * @param {object} files   - Uploaded files object (keyed by field name).
   * @param {object} req     - Express request, enriched by AuthGuard with `req.user`.
   * @param {any}    payload - Body payload; must include `uniqueId` to match the draft attachment.
   * @returns {Promise<object>} Status envelope indicating success or failure.
   */
  @UseGuards(AuthGuard)
  @Get('/products/messages')
  async getAllProductsWithMessages(
    @Query('sellerId', ParseIntPipe) sellerId: number,
  ) {
    return this.chatService.getAllProductsWithMessages(sellerId);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(AuthGuard)
  @Post('/upload-attachment')
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'content', maxCount: 1 }
  ]))
  async uploadAttachment(@UploadedFiles() files, @Request() req, @Body() payload: any) {
    return this.chatService.uploadAttachment(files, req, payload);
  }

  /**
   * @method downloadFile
   * @description Generates a time-limited presigned S3 URL for downloading a chat attachment.
   *
   * @intent Give authenticated users secure, temporary access to download a file stored in S3
   *         without exposing raw bucket credentials.
   * @idea The client receives a presigned URL and redirects the browser/download manager to it.
   * @usage `GET /chat/download-attachment?file-path=<S3 key>`
   * @dataflow Query param (S3 key) --> S3service.getPresignedUrl --> presigned URL response.
   * @dependencies {@link S3service#getPresignedUrl}, {@link AuthGuard}.
   * @notes
   * - Uses the raw Express `@Res()` decorator, so NestJS's automatic serialisation is bypassed.
   * - Returns 401 when the file is not found in S3 (semantically could be 404).
   * - Returns 500 on any unexpected error during URL generation.
   *
   * @param {string} fileKey - The S3 object key (path) of the attachment.
   * @param {object} req     - Express request (unused but available for future auth checks).
   * @param {object} res     - Raw Express response object for manual status/JSON control.
   * @returns {Promise<void>} Sends JSON directly via `res`; no NestJS return value.
   */
  @UseGuards(AuthGuard)
  @Get('/download-attachment')
  async downloadFile(@Query('file-path') fileKey: string, @Request() req, @Res() res: any) {
    try {
      const presignedUrl = await this.s3service.getPresignedUrl(fileKey);
      if (presignedUrl) {
        return res.status(200).json({
          url: presignedUrl,
          message: 'Presigned URL generated successfully',
        });
      } else {
        return res.status(401).json({
          url: null,
          message: 'File is not found in S3 bucket',
        });
      }

    } catch (error) {
      return res.status(500).json({
        message: 'Failed to generate presigned URL',
      });
    }
  }

  @UseGuards(AuthGuard)
  @Post('/select-suggested-products')
  async selectSuggestedProducts(
    @Body() payload: SelectSuggestedProductsDto,
    @Request() req: any
  ) {
    const buyerId = req.user.id;
    return this.chatService.selectSuggestedProducts({
      ...payload,
      buyerId,
    });
  }

  @UseGuards(AuthGuard)
  @Get('/vendor-products-for-suggestion')
  async getVendorProductsForSuggestion(
    @Query('vendorId', ParseIntPipe) vendorId: number,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Request() req: any,
    @Query('term') term: string | undefined
  ) {
    // Verify the requesting user is the vendor
    if (req.user.id !== vendorId) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 50;

    return this.chatService.getVendorProductsForSuggestion(vendorId, { page: pageNum, limit: limitNum, term });
  }
}