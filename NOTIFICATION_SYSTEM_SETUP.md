# Notification System - Backend Setup Guide

## ✅ Implementation Complete

All backend code has been implemented. Follow these steps to activate the notification system.

## 📋 Setup Steps

### 1. Run Database Migration

**⚠️ CRITICAL: Run this before starting the server!**

```bash
cd backend
npx prisma migrate dev --name add_notification_model
npx prisma generate
```

This will:
- Create the `Notification` table in your database
- Generate Prisma client with Notification model
- **NO existing data will be affected** - only adds a new table

### 2. Restart Backend Server

After migration, restart your NestJS server:
```bash
npm run start:dev
# or
npm run start
```

### 3. Verify Implementation

Test the endpoints:
- `GET /notification` - Should return empty array (no notifications yet)
- `GET /notification/unread-count` - Should return `{ count: 0 }`

## 📁 Files Created/Modified

### Created:
- `src/notification/notification.controller.ts` - API endpoints
- `src/notification/notification.helper.ts` - Helper functions
- `src/notification/BACKEND_NOTIFICATION_IMPLEMENTATION.md` - Detailed docs
- `prisma/migrations/create_notifications_table.sql` - SQL reference

### Modified:
- `prisma/schema.prisma` - Added Notification model
- `src/notification/notification.service.ts` - Added notification methods
- `src/notification/notification.module.ts` - Added controller
- `src/chat/chat.gateway.ts` - Pass server to notification service
- `src/chat/chat.module.ts` - Import NotificationModule

## 🔌 Socket Integration

Users automatically join `user-{userId}` room when they connect via socket. Notifications are emitted to this room.

## 📝 Usage Example

```typescript
// In any service (e.g., order.service.ts)
import { NotificationService } from '../notification/notification.service';

constructor(
  private readonly notificationService: NotificationService,
) {}

// Create notification
await this.notificationService.createNotification({
  userId: 123,
  type: 'ORDER',
  title: 'New Order',
  message: 'You have a new order #12345',
  data: { orderId: 12345 },
  link: '/orders/12345',
});
```

## ⚠️ Important Notes

1. **Migration is REQUIRED** - The system won't work without running Prisma migration
2. **No data loss** - Migration only adds a new table
3. **Socket events** - Automatically work once server is restarted
4. **Authentication** - All endpoints require valid JWT token

## 🚀 Next Steps

1. Run Prisma migration (see step 1)
2. Restart backend server
3. Test endpoints
4. Integrate notification creation in your services (see helper file)

For detailed documentation, see:
- `src/notification/BACKEND_NOTIFICATION_IMPLEMENTATION.md`

