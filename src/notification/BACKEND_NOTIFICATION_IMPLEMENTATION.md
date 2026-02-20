# Backend Notification System Implementation

## ✅ Completed Implementation

### Files Created/Modified

1. **Prisma Schema** (`prisma/schema.prisma`)
   - Added `Notification` model
   - Added relation to `User` model

2. **Notification Controller** (`src/notification/notification.controller.ts`)
   - GET `/notification` - Get notifications with pagination and filters
   - GET `/notification/unread-count` - Get unread count
   - PUT `/notification/:id/read` - Mark notification as read
   - PUT `/notification/read-all` - Mark all as read
   - DELETE `/notification/:id` - Delete notification
   - DELETE `/notification` - Delete all notifications

3. **Notification Service** (`src/notification/notification.service.ts`)
   - `createNotification()` - Create and emit notification
   - `getNotifications()` - Get paginated notifications
   - `getUnreadCount()` - Get unread count
   - `markAsRead()` - Mark as read
   - `markAllAsRead()` - Mark all as read
   - `deleteNotification()` - Delete notification
   - `deleteAllNotifications()` - Delete all notifications

4. **Notification Module** (`src/notification/notification.module.ts`)
   - Added controller
   - Exported service for use in other modules

5. **Chat Gateway** (`src/chat/chat.gateway.ts`)
   - Updated to pass server to notification service
   - Users join `user-{userId}` room for notifications

6. **Chat Module** (`src/chat/chat.module.ts`)
   - Imported NotificationModule to access NotificationService

## 🗄️ Database Migration

### Option 1: Using Prisma (Recommended)
```bash
cd backend
npx prisma migrate dev --name add_notification_model
npx prisma generate
```

### Option 2: Manual SQL
See `prisma/migrations/create_notifications_table.sql` for raw SQL.

**⚠️ Important**: The Prisma schema has been updated. You MUST run the migration before the backend will work.

## 🔌 Socket Events

The notification system emits these socket events:

1. **`notification`** - Emitted when a new notification is created
   ```typescript
   server.to(`user-${userId}`).emit('notification', notification);
   ```

2. **`notification:count`** - Emitted when unread count changes
   ```typescript
   server.to(`user-${userId}`).emit('notification:count', count);
   ```

Users automatically join `user-{userId}` room when they connect via socket.

## 📝 How to Create Notifications

### From Any Service

```typescript
import { NotificationService } from '../notification/notification.service';

// In your service constructor
constructor(
  private readonly notificationService: NotificationService,
) {}

// Create a notification
await this.notificationService.createNotification({
  userId: targetUserId,
  type: 'ORDER',
  title: 'New Order Received',
  message: 'You have received a new order #12345',
  data: { orderId: 12345 },
  link: '/orders/12345',
  icon: 'order',
});
```

### Notification Types

- `ORDER` - Order-related notifications
- `MESSAGE` - Chat/message notifications
- `RFQ` - RFQ quote notifications
- `REVIEW` - Review notifications
- `SYSTEM` - System notifications
- `PAYMENT` - Payment notifications
- `SHIPMENT` - Shipment notifications
- `ACCOUNT` - Account-related notifications

## 🔗 Integration Examples

### Example 1: Order Service

```typescript
// In order.service.ts
async updateOrderStatus(orderId: number, status: string) {
  const order = await prisma.order.update({
    where: { id: orderId },
    data: { status },
  });

  // Notify seller
  if (order.vendorId) {
    await this.notificationService.createNotification({
      userId: order.vendorId,
      type: 'ORDER',
      title: 'Order Status Updated',
      message: `Order #${order.orderNumber} status changed to ${status}`,
      data: { orderId: order.id, status },
      link: `/orders/${order.id}`,
    });
  }

  // Notify buyer
  if (order.customerId) {
    await this.notificationService.createNotification({
      userId: order.customerId,
      type: 'ORDER',
      title: 'Your Order Status Updated',
      message: `Your order #${order.orderNumber} status changed to ${status}`,
      data: { orderId: order.id, status },
      link: `/my-orders/${order.id}`,
    });
  }

  return order;
}
```

### Example 2: Chat Service

```typescript
// In chat.service.ts
async sendMessage(sendMessageDto: SendMessageDto) {
  const message = await prisma.message.create({...});

  // Get room participants
  const room = await prisma.room.findUnique({
    where: { id: sendMessageDto.roomId },
    include: { participants: true },
  });

  // Notify all participants except sender
  for (const participant of room.participants) {
    if (participant.userId !== sendMessageDto.userId) {
      await this.notificationService.createNotification({
        userId: participant.userId,
        type: 'MESSAGE',
        title: 'New Message',
        message: `You have a new message from ${senderName}`,
        data: { messageId: message.id, roomId: sendMessageDto.roomId },
        link: `/chat?room=${sendMessageDto.roomId}`,
      });
    }
  }

  return message;
}
```

### Example 3: RFQ Service

```typescript
// In rfq.service.ts
async createQuote(rfqId: number, sellerId: number) {
  const quote = await prisma.rfqQuotes.create({...});

  // Notify buyer
  const rfq = await prisma.rfqProduct.findUnique({
    where: { id: rfqId },
  });

  await this.notificationService.createNotification({
    userId: rfq.userId,
    type: 'RFQ',
    title: 'New Quote Received',
    message: `You have received a new quote for RFQ #${rfqId}`,
    data: { rfqId, quoteId: quote.id },
    link: `/rfq/${rfqId}`,
  });

  return quote;
}
```

## 🚀 Next Steps

1. **Run Prisma Migration**
   ```bash
   cd backend
   npx prisma migrate dev --name add_notification_model
   npx prisma generate
   ```

2. **Restart Backend Server**
   - The new endpoints will be available
   - Socket events will work automatically

3. **Integrate in Services**
   - Add NotificationService to services that need to send notifications
   - Use `createNotification()` method

4. **Test Endpoints**
   - Use Postman/Thunder Client to test API endpoints
   - Verify socket events are emitted

## 📋 API Endpoints

All endpoints require authentication (`@UseGuards(AuthGuard)`).

### GET `/notification`
Query params:
- `page` (number, default: 1)
- `limit` (number, default: 10)
- `type` (string, optional)
- `read` (string: "true" | "false", optional)

Response:
```json
{
  "status": true,
  "message": "Notifications fetched successfully",
  "data": {
    "data": [...],
    "total": 100,
    "page": 1,
    "limit": 10,
    "unreadCount": 5
  }
}
```

### GET `/notification/unread-count`
Response:
```json
{
  "status": true,
  "message": "Unread count fetched successfully",
  "data": {
    "count": 5
  }
}
```

### PUT `/notification/:id/read`
Response:
```json
{
  "status": true,
  "message": "Notification marked as read",
  "data": { ...notification }
}
```

### PUT `/notification/read-all`
Response:
```json
{
  "status": true,
  "message": "All notifications marked as read",
  "data": {
    "count": 10
  }
}
```

### DELETE `/notification/:id`
Response:
```json
{
  "status": true,
  "message": "Notification deleted successfully",
  "data": {
    "success": true
  }
}
```

### DELETE `/notification`
Response:
```json
{
  "status": true,
  "message": "All notifications deleted successfully",
  "data": {
    "success": true,
    "count": 50
  }
}
```

## ⚠️ Important Notes

1. **Database Migration Required**: You MUST run Prisma migration before using the system
2. **Socket Server**: The notification service needs the socket server, which is passed from ChatGateway
3. **User Rooms**: Users automatically join `user-{userId}` room on socket connection
4. **Authentication**: All endpoints require valid JWT token
5. **Data Safety**: The migration only ADDS a new table, no existing data is affected

## 🐛 Troubleshooting

### Notifications not being created
- Check if Prisma migration was run
- Verify NotificationService is injected correctly
- Check server logs for errors

### Socket events not working
- Verify ChatGateway is passing server to NotificationService
- Check if user is connected to socket (should join `user-{userId}` room)
- Verify socket namespace is `/ws`

### API endpoints not found
- Check if NotificationController is registered in NotificationModule
- Verify NotificationModule is imported in AppModule
- Restart the backend server

