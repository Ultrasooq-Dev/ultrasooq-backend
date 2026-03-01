/**
 * @file chat.gateway.ts
 * @description Socket.io WebSocket gateway for real-time chat functionality in the
 * Ultrasooq marketplace. Handles bidirectional events for creating rooms, sending
 * messages, and updating RFQ price requests. Manages user-to-socket mapping for
 * room-based message broadcasting.
 *
 * @module ChatGateway
 *
 * @dependencies
 * - {@link ChatService}           -- Business logic for persistence and room management.
 * - {@link SendMessageDto}        -- DTO for standard RFQ chat messages.
 * - {@link CreateRoomDto}         -- DTO for creating an RFQ-linked private room.
 * - {@link UpdateRfqPriceRequest} -- DTO for RFQ price-request status updates.
 * - {@link CreateRoomOrderDto}    -- DTO for creating an order-linked private room.
 * - {@link SendMessageForOrderDto}-- DTO for order-specific chat messages.
 *
 * @dataflow
 * Client (Socket.io) <--events--> ChatGateway --> ChatService --> PrismaClient
 *                                           \--> Server.emit (broadcast to rooms)
 *
 * @notes
 * - Namespace: `/ws`, CORS: uses CORS_ORIGINS env var (falls back to localhost in dev).
 * - Each connecting client provides a `userId` query parameter used to register the
 *   socket and auto-join all rooms the user participates in.
 * - The gateway passes the Socket.io `Server` instance to {@link ChatService} via
 *   `setServer()` so the service can emit events directly (e.g., attachment uploads).
 */
import { WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket, OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRfqPriceRequest } from './dto/updateRfqPriceRequest.dto';
import { CreateRoomOrderDto } from './dto/create-room-for-order.dto';
import { SendMessageForOrderDto } from './dto/send-message-for-order.dto';
import { NotificationService } from '../notification/notification.service';

/**
 * @class ChatGateway
 * @description NestJS WebSocket gateway that listens on the `/ws` namespace.
 * Implements `OnGatewayConnection` and `OnGatewayDisconnect` lifecycle hooks to
 * maintain a live mapping of authenticated user IDs to socket IDs.
 *
 * @idea Centralise all real-time chat event handling in a single gateway class,
 * keeping the service layer protocol-agnostic.
 *
 * @usage Automatically instantiated by NestJS when {@link ChatModule} is loaded.
 */
@WebSocketGateway({
  namespace: '/ws',
  cors: {
    origin: process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',')
      : ['http://localhost:4001', 'http://localhost:3001'],
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  /** @description Reference to the underlying Socket.io Server instance, injected by NestJS. */
  @WebSocketServer()
  server: Server;

  /**
   * @description In-memory map from user ID to their current socket ID.
   * Used to locate a user's socket when they need to be pulled into a newly created room.
   * @type {Map<number, string>}
   */
  private userSocketMap: Map<number, string> = new Map();

  /**
   * @constructor
   * @description Injects the chat service, notification service, JWT service, and config service.
   * @param {ChatService} chatService - The shared chat service instance.
   * @param {NotificationService} notificationService - The notification service instance.
   * @param {JwtService} jwtService - JWT token verification service.
   * @param {ConfigService} configService - Application configuration service for reading env vars.
   */
  constructor(
    private readonly chatService: ChatService,
    private readonly notificationService: NotificationService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) { }

  /**
   * @method afterInit
   * @description NestJS gateway lifecycle hook called once the WebSocket server is initialised.
   *
   * @intent Share the Socket.io Server reference with {@link ChatService} so the service can
   *         emit events (e.g., `newAttachment`) outside of the gateway's own event handlers.
   *         Also registers a Socket.io middleware that enforces JWT authentication on every
   *         new connection handshake.
   * @idea Decouples socket emission from HTTP-triggered flows (like file upload) by giving
   *       the service direct access to the server. The JWT middleware ensures that only
   *       authenticated users can establish a WebSocket connection — the verified token
   *       payload is stored on `socket.data.user` for downstream handlers to use.
   * @usage Called automatically by the NestJS WebSocket adapter; not invoked manually.
   * @dataflow
   *   1. Register JWT authentication middleware on the Socket.io server.
   *   2. this.server --> ChatService.setServer().
   *   3. this.server --> NotificationService.setServer().
   * @dependencies {@link ChatService#setServer}, {@link JwtService#verify}, {@link ConfigService}.
   * @notes No return value; purely a side-effect initialiser.
   */
  afterInit(server: Server) {
    // Register JWT authentication middleware on socket connections
    server.use(async (socket: Socket, next) => {
      try {
        const token =
          socket.handshake.auth?.token ||
          socket.handshake.headers?.authorization?.replace('Bearer ', '');

        if (!token) {
          return next(new Error('Authentication required'));
        }

        const payload = this.jwtService.verify(token, {
          secret: this.configService.get<string>('JWT_SECRET'),
        });

        socket.data.user = payload;
        next();
      } catch (err) {
        next(new Error('Invalid or expired token'));
      }
    });

    // Pass the server to the chatService
    this.chatService.setServer(this.server);
    // Pass the server to the notificationService
    this.notificationService.setServer(this.server);
  }

  /**
   * @method handleCreateRoom
   * @description Handles the `createPrivateRoom` WebSocket event. Creates a new RFQ-linked
   * chat room, joins all participants, and optionally sends an initial message with attachments.
   *
   * @intent Allow a buyer or seller to open a new private negotiation room for an RFQ in
   *         real time, with all parties immediately joined and notified.
   * @idea Combines room creation, participant socket joining, initial message persistence,
   *       attachment saving, and broadcasting into a single atomic-feeling operation.
   * @usage Client emits `createPrivateRoom` with a {@link CreateRoomDto} payload.
   * @dataflow
   *   1. ChatService.createRoom --> Prisma room + participants.
   *   2. Client joins the room; other online participants are also joined via userSocketMap.
   *   3. `newRoomCreated` event is broadcast to the room.
   *   4. If content or attachments exist, ChatService.sendMessage persists the message.
   *   5. If attachments exist, ChatService.saveAttachmentMessage stores draft records.
   *   6. `receivedMessage` event is broadcast to the room.
   * @dependencies {@link ChatService#createRoom}, {@link ChatService#sendMessage},
   *               {@link ChatService#saveAttachmentMessage}.
   * @notes
   * - On error, emits `createPrivateRoomError` back to the originating client only.
   * - Offline participants will not be joined to the room until they reconnect
   *   (handled in `handleConnection`).
   *
   * @param {CreateRoomDto} createRoomDto - Room creation payload.
   * @param {Socket}        client        - The connected Socket.io client.
   * @returns {Promise<void>}
   */
  @SubscribeMessage('createPrivateRoom')
  async handleCreateRoom(@MessageBody() createRoomDto: CreateRoomDto, @ConnectedSocket() client: Socket) {
    try {
      const roomId = await this.chatService.createRoom(createRoomDto);

      // Add the sender to the room
      client.join(roomId.toString());

      for (const participantId of createRoomDto.participants) {
        // Skip the creator if they are in the participants list
        if (participantId === createRoomDto.creatorId) continue;

        const participantSocketId = this.userSocketMap.get(participantId);
        if (participantSocketId) {
          client.to(participantSocketId).socketsJoin(roomId.toString());
        }
      }

      // Notify user that a room created
      this.server.to(roomId.toString()).emit('newRoomCreated', { roomId, creatorId: createRoomDto.creatorId })

      // Send the initial message if provided
      if (createRoomDto.content || createRoomDto?.attachments?.length > 0) {
        const sendMessageDto: SendMessageDto = {
          roomId: roomId,
          content: createRoomDto.content || "",
          userId: createRoomDto.creatorId,
          rfqId: createRoomDto.rfqId,
          rfqQuoteProductId: createRoomDto.rfqQuoteProductId,
          buyerId: createRoomDto.buyerId,
          sellerId: createRoomDto.sellerId,
          requestedPrice: createRoomDto.requestedPrice,
          rfqQuotesUserId: createRoomDto.rfqQuotesUserId,
          suggestForRfqQuoteProductId: createRoomDto.suggestForRfqQuoteProductId,
          suggestedProducts: createRoomDto.suggestedProducts,
          attachments: createRoomDto.attachments
        };
        const newMessage = await this.chatService.sendMessage(sendMessageDto);
        const message = {
          id: newMessage.id,
          content: newMessage.content,
          userId: newMessage.userId,
          roomId: newMessage.roomId,
          rfqId: newMessage.rfqId,
          user: newMessage.user,
          participants: newMessage.participants,
          rfqProductPriceRequest: newMessage.rfqPPRequest,
          rfqSuggestedProducts: newMessage.rfqSuggestedProducts || [],
          rfqQuotesUserId: newMessage.rfqQuotesUserId,
          createdAt: newMessage.createdAt ? newMessage.createdAt.toISOString() : new Date().toISOString(),
          updatedAt: newMessage.updatedAt ? newMessage.updatedAt.toISOString() : new Date().toISOString(),
          uniqueId: createRoomDto.uniqueId
        };

        // save the attachments in draft
        if (createRoomDto?.attachments?.length) {
          const newData = createRoomDto?.attachments.map((att: any) => ({ ...att, messageId: message?.id }))
          const payload = {
            attachments: newData
          }
          await this.chatService.saveAttachmentMessage(payload);
        }
        // Emit the message to the specified room
        this.server.to(roomId.toString()).emit('receivedMessage', message);
      }
    } catch (error) {
      client.emit('createPrivateRoomError', { message: 'Failed to create a private room', status: 500 });
    }
  }

  /**
   * @method handleMessage
   * @description Handles the `sendMessage` WebSocket event. Persists an RFQ chat message,
   * optionally saves attachment draft records, and broadcasts the message to the room.
   *
   * @intent Enable real-time message delivery within an existing RFQ chat room.
   * @idea The message is persisted first (source of truth), then broadcast. Attachments
   *       are saved as draft records; the actual file upload happens separately via the
   *       REST `/upload-attachment` endpoint.
   * @usage Client emits `sendMessage` with a {@link SendMessageDto} payload.
   * @dataflow
   *   1. ChatService.sendMessage --> Prisma `message.create` (+ optional rfqQuoteProductPriceRequest).
   *   2. If attachments present, ChatService.saveAttachmentMessage --> Prisma `chatAttachments.createMany`.
   *   3. Broadcast `receivedMessage` to every socket in the room.
   * @dependencies {@link ChatService#sendMessage}, {@link ChatService#saveAttachmentMessage}.
   * @notes
   * - On error, emits `sendMessageError` to the originating client only.
   * - The `uniqueId` is a client-generated idempotency key relayed back for optimistic UI updates.
   *
   * @param {SendMessageDto} sendMessageDto - Message payload.
   * @param {Socket}         client         - The connected Socket.io client.
   * @returns {Promise<void>}
   */
  @SubscribeMessage('sendMessage')
  async handleMessage(@MessageBody() sendMessageDto: SendMessageDto, @ConnectedSocket() client: Socket) {
    try {
      const newMessage = await this.chatService.sendMessage(sendMessageDto);
      let message = {
        id: newMessage.id,
        content: newMessage.content,
        userId: newMessage.userId,
        roomId: newMessage.roomId,
        rfqId: newMessage.rfqId,
        user: newMessage.user,
        participants: newMessage.participants,
        rfqProductPriceRequest: newMessage.rfqPPRequest,
        rfqSuggestedProducts: newMessage.rfqSuggestedProducts || [],
        rfqQuotesUserId: newMessage.rfqQuotesUserId,
        createdAt: newMessage.createdAt ? newMessage.createdAt.toISOString() : new Date().toISOString(),
        updatedAt: newMessage.updatedAt ? newMessage.updatedAt.toISOString() : new Date().toISOString(),
        uniqueId: sendMessageDto.uniqueId
      };
      // save the attachments in draft
      if (sendMessageDto?.attachments?.length) {
        const newData = sendMessageDto?.attachments.map((att: any) => ({ ...att, messageId: message?.id }))
        const payload = {
          attachments: newData
        }
        await this.chatService.saveAttachmentMessage(payload);
      }

      this.server.to(sendMessageDto.roomId.toString()).emit('receivedMessage', message);

    } catch (error) {
      client.emit('sendMessageError', { message: 'Failed to send message', status: 500 });
    }
  }

  /**
   * @method handleUpdateRfqRequestPrice
   * @description Handles the `updateRfqPriceRequest` WebSocket event. Approves or rejects
   * an RFQ price-request and, when approved, recalculates the total offer price.
   *
   * @intent Let a buyer or seller approve/reject a negotiated price change in real time,
   *         immediately reflecting the new state for all participants in the room.
   * @idea When the status is "A" (Approved), the offer price on the RFQ quote product
   *       is updated first, and the parent RFQ user's total offer price is recalculated.
   *       Then the price-request record itself is updated. The final state is broadcast
   *       as `updatedRfqPriceRequest`.
   * @usage Client emits `updateRfqPriceRequest` with an {@link UpdateRfqPriceRequest} payload.
   * @dataflow
   *   1. If approved: ChatService.updateRfqQuotesProductsOfferPrice --> Prisma updates
   *      rfqQuotesProducts + rfqQuotesUsers.
   *   2. ChatService.updateRfqPriceRequestStatus --> Prisma rfqQuoteProductPriceRequest update.
   *   3. Broadcast `updatedRfqPriceRequest` to the room.
   * @dependencies {@link ChatService#updateRfqQuotesProductsOfferPrice},
   *               {@link ChatService#updateRfqPriceRequestStatus}.
   * @notes
   * - On error, emits `updateRfqPriceRequestError` to the originating client.
   * - `newTotalOfferPrice` is 0 for non-approved statuses.
   *
   * @param {UpdateRfqPriceRequest} updateRfqPriceRequest - Status update payload.
   * @param {Socket}                client                - The connected Socket.io client.
   * @returns {Promise<void>}
   */
  @SubscribeMessage('updateRfqPriceRequest')
  async handleUpdateRfqRequestPrice(@MessageBody() updateRfqPriceRequest: UpdateRfqPriceRequest, @ConnectedSocket() client: Socket) {
    try {
      let newTotalOfferPrice: number = 0;
      // UPDATE THE OFFER PRICE THE THE STATUS IF APPROVED
      if (updateRfqPriceRequest.status === "A") {
        const payload = {
          id: updateRfqPriceRequest.rfqQuoteProductId,
          offerPrice: updateRfqPriceRequest.requestedPrice,
          rfqUserId: updateRfqPriceRequest.rfqUserId
        }
        const updatedRfqUser = await this.chatService.updateRfqQuotesProductsOfferPrice(payload);
        newTotalOfferPrice = updatedRfqUser.newTotalOfferPrice;
      }

      const updatedRe = await this.chatService.updateRfqPriceRequestStatus(updateRfqPriceRequest);
      const rfqRequest = {
        id: updatedRe.id,
        messageId: updatedRe.messageId,
        rfqQuoteProductId: updatedRe.rfqQuoteProductId,
        status: updatedRe.status,
        requestedPrice: updatedRe.requestedPrice,
        requestedById: updatedRe.requestedById,
        newTotalOfferPrice,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.server.to(updateRfqPriceRequest.roomId.toString()).emit('updatedRfqPriceRequest', rfqRequest);
    } catch (error) {
      client.emit('updateRfqPriceRequestError', { message: 'Failed to update status', status: 500 });
    }
  }

  /**
   * @method handleCreatePrivateRoomForOrder
   * @description Handles the `createPrivateRoomForOrder` WebSocket event. Creates a chat room
   * linked to an order-product, joins participants, and optionally sends an initial message.
   *
   * @intent Allow buyers and sellers to start a chat about a specific order-product item,
   *         with the same real-time room creation and initial-message flow as RFQ rooms.
   * @idea Mirrors `handleCreateRoom` but references `orderProductId` instead of `rfqId`,
   *       and delegates to `ChatService.createRoomForOrder` / `sendMessageForOrder`.
   * @usage Client emits `createPrivateRoomForOrder` with a {@link CreateRoomOrderDto} payload.
   * @dataflow
   *   1. ChatService.createRoomForOrder --> Prisma room + participants (with orderProductId).
   *   2. Client joins the room; other online participants are joined via userSocketMap.
   *   3. `newRoomCreated` event is broadcast to the room.
   *   4. If content or attachments exist, ChatService.sendMessageForOrder persists the message.
   *   5. If attachments exist, ChatService.saveAttachmentMessage stores draft records.
   *   6. `receivedMessage` event is broadcast to the room.
   * @dependencies {@link ChatService#createRoomForOrder}, {@link ChatService#sendMessageForOrder},
   *               {@link ChatService#saveAttachmentMessage}.
   * @notes
   * - On error, emits `createPrivateRoomError` to the originating client.
   * - Order-linked rooms do not carry RFQ price-request data.
   *
   * @param {CreateRoomOrderDto} createRoomOrderDto - Order room creation payload.
   * @param {Socket}             client             - The connected Socket.io client.
   * @returns {Promise<void>}
   */
  @SubscribeMessage('createPrivateRoomForOrder')
  async handleCreatePrivateRoomForOrder(@MessageBody() createRoomOrderDto: CreateRoomOrderDto, @ConnectedSocket() client: Socket) {
    try {
      const roomId = await this.chatService.createRoomForOrder(createRoomOrderDto);

      // Add the sender to the room
      client.join(roomId.toString());

      for (const participantId of createRoomOrderDto.participants) {
        // Skip the creator if they are in the participants list
        if (participantId === createRoomOrderDto.creatorId) continue;

        const participantSocketId = this.userSocketMap.get(participantId);
        if (participantSocketId) {
          client.to(participantSocketId).socketsJoin(roomId.toString());
        }
      }

      // Notify user that a room created
      this.server.to(roomId.toString()).emit('newRoomCreated', { roomId, creatorId: createRoomOrderDto.creatorId })

      // Send the initial message if provided
      if (createRoomOrderDto.content || createRoomOrderDto?.attachments?.length > 0) {
        const sendMessageForOrderDto: SendMessageForOrderDto = {
          roomId: roomId,
          content: createRoomOrderDto.content,
          userId: createRoomOrderDto.creatorId,
          orderProductId: createRoomOrderDto.orderProductId,
          attachments: createRoomOrderDto.attachments
        };
        const newMessage = await this.chatService.sendMessageForOrder(sendMessageForOrderDto);
        const message = {
          id: newMessage.id,
          content: newMessage.content,
          userId: newMessage.userId,
          roomId: newMessage.roomId,
          user: newMessage.user,
          participants: newMessage.participants,
          orderProductId: newMessage.orderProductId,
          createdAt: new Date(),
          updatedAt: new Date(),
          uniqueId: createRoomOrderDto.uniqueId
        };

        // save the attachments in draft
        if (createRoomOrderDto?.attachments?.length) {
          const newData = createRoomOrderDto?.attachments.map((att: any) => ({ ...att, messageId: message?.id }))
          const payload = {
            attachments: newData
          }
          await this.chatService.saveAttachmentMessage(payload);
        }
        // Emit the message to the specified room
        this.server.to(roomId.toString()).emit('receivedMessage', message);
      }
    } catch (error) {
      client.emit('createPrivateRoomError', { message: 'Failed to create a private room', status: 500 });
    }
  }

  /**
   * @method handleSendMessageForOrder
   * @description Handles the `sendMessageForOrder` WebSocket event. Persists an order-specific
   * chat message, optionally saves attachment drafts, and broadcasts to the room.
   *
   * @intent Enable real-time message delivery within an order-product chat room.
   * @idea Mirrors `handleMessage` but uses the order-specific service method and DTO which
   *       references `orderProductId` instead of `rfqId`.
   * @usage Client emits `sendMessageForOrder` with a {@link SendMessageForOrderDto} payload.
   * @dataflow
   *   1. ChatService.sendMessageForOrder --> Prisma `message.create` (with orderProductId).
   *   2. If attachments present, ChatService.saveAttachmentMessage --> Prisma `chatAttachments.createMany`.
   *   3. Broadcast `receivedMessage` to the room.
   * @dependencies {@link ChatService#sendMessageForOrder}, {@link ChatService#saveAttachmentMessage}.
   * @notes On error, emits `sendMessageError` to the originating client only.
   *
   * @param {SendMessageForOrderDto} sendMessageForOrderDto - Order message payload.
   * @param {Socket}                 client                 - The connected Socket.io client.
   * @returns {Promise<void>}
   */
  @SubscribeMessage('sendMessageForOrder')
  async handleSendMessageForOrder(@MessageBody() sendMessageForOrderDto: SendMessageForOrderDto, @ConnectedSocket() client: Socket) {
    try {
      const newMessage = await this.chatService.sendMessageForOrder(sendMessageForOrderDto);
      let message = {
        id: newMessage.id,
        content: newMessage.content,
        userId: newMessage.userId,
        roomId: newMessage.roomId,
        user: newMessage.user,
        participants: newMessage.participants,
        orderProductId: newMessage.orderProductId,
        createdAt: new Date(),
        updatedAt: new Date(),
        uniqueId: sendMessageForOrderDto.uniqueId
      };
      // save the attachments in draft
      if (sendMessageForOrderDto?.attachments?.length) {
        const newData = sendMessageForOrderDto?.attachments.map((att: any) => ({ ...att, messageId: message?.id }))
        const payload = {
          attachments: newData
        }
        await this.chatService.saveAttachmentMessage(payload);
      }

      this.server.to(sendMessageForOrderDto.roomId.toString()).emit('receivedMessage', message);

    } catch (error) {
      client.emit('sendMessageError', { message: 'Failed to send message', status: 500 });
    }
  }

  /**
   * @method handleConnection
   * @description Lifecycle hook invoked when a new Socket.io client connects.
   *
   * @intent Register the client in the user-to-socket map and auto-join them to every
   *         chat room they participate in, ensuring they receive real-time messages
   *         immediately upon connection.
   * @idea The `userId` is extracted from the handshake query string (`?userId=<number>`).
   *       If valid, the socket is stored in `userSocketMap` and the user is joined to
   *       all their rooms via {@link ChatService#getRoomsForUser}.
   * @usage Called automatically by Socket.io when a client establishes a connection.
   * @dataflow
   *   1. Parse `userId` from `client.handshake.query`.
   *   2. Store mapping: userId --> client.id in `userSocketMap`.
   *   3. ChatService.getRoomsForUser --> Prisma query for all room IDs.
   *   4. `client.join(roomId)` for each room.
   * @dependencies {@link ChatService#getRoomsForUser}.
   * @notes
   * - Only one socket per user is tracked. A second connection from the same user
   *   will overwrite the previous socket ID.
   * - If `userId` is NaN or missing, the socket is not registered.
   *
   * @param {Socket} client - The newly connected Socket.io client.
   * @returns {Promise<void>}
   */
  async handleConnection(@ConnectedSocket() client: Socket) {
    const userId = parseInt(client.handshake.query.userId as string, 10);

    if (userId && !isNaN(userId)) {
      this.userSocketMap.set(userId, client.id);
      const rooms = await this.chatService.getRoomsForUser(userId);
      rooms.forEach((room: number) => {
        client.join(room.toString());
      });
      // Join user to their notification room
      client.join(`user-${userId}`);
    }
  }

  /**
   * @method handleDisconnect
   * @description Lifecycle hook invoked when a Socket.io client disconnects.
   *
   * @intent Clean up the user-to-socket mapping so stale entries do not accumulate
   *         and so that subsequent room-join attempts for that user will correctly
   *         identify them as offline.
   * @idea Performs a reverse lookup on `userSocketMap` to find the user ID by socket ID,
   *       then removes the entry.
   * @usage Called automatically by Socket.io when a client disconnects.
   * @dataflow Reverse lookup on `userSocketMap` --> delete entry.
   * @dependencies None (internal state only).
   * @notes Logs the disconnection event.
   *
   * @param {Socket} client - The disconnected Socket.io client.
   * @returns {void}
   */
  handleDisconnect(client: Socket) {
    const userId = Array.from(this.userSocketMap.keys()).find(key => this.userSocketMap.get(key) === client.id);
    if (userId) {
      this.userSocketMap.delete(userId);
    }
  }
} 