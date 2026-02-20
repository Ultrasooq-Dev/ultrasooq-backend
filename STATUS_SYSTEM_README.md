# User Status System Documentation

## Overview
This document describes the new user status system implemented in the Puremoon backend to support better user account management and approval workflows.

## Status Values

### Core Statuses
- **WAITING** - Default status for new sub-accounts (pending approval)
- **ACTIVE** - Approved and active accounts
- **REJECT** - Rejected accounts (requires reason)
- **INACTIVE** - Deactivated accounts (requires reason)
- **WAITING_FOR_SUPER_ADMIN** - Escalated to super admin for review

### Legacy Statuses (Maintained for compatibility)
- **DELETE** - Deleted accounts
- **HIDDEN** - Hidden accounts

## Status Transitions

### Valid Status Flow
```
WAITING → ACTIVE (Approve)
WAITING → REJECT (Reject with reason)
WAITING → INACTIVE (Deactivate with reason)
WAITING → WAITING_FOR_SUPER_ADMIN (Escalate to super admin)

ACTIVE → REJECT (Reject with reason)
ACTIVE → INACTIVE (Deactivate with reason)
ACTIVE → WAITING_FOR_SUPER_ADMIN (Escalate to super admin)

REJECT → ACTIVE (Re-approve)
REJECT → INACTIVE (Deactivate with reason)
REJECT → WAITING_FOR_SUPER_ADMIN (Escalate to super admin)

INACTIVE → ACTIVE (Re-approve)
INACTIVE → REJECT (Reject with reason)
INACTIVE → WAITING_FOR_SUPER_ADMIN (Escalate to super admin)

WAITING_FOR_SUPER_ADMIN → ACTIVE (Approve by super admin)
WAITING_FOR_SUPER_ADMIN → REJECT (Reject by super admin)
WAITING_FOR_SUPER_ADMIN → INACTIVE (Deactivate by super admin)
```

### Invalid Transitions
- Cannot go directly from ACTIVE to WAITING
- Cannot go directly from REJECT to WAITING
- All transitions are validated server-side

## API Endpoints

### 1. Update Single User Status
```
PATCH /admin/updateOneUser
```
**Request Body:**
```json
{
  "userId": 123,
  "status": "ACTIVE",
  "statusNote": "Approved after document verification"
}
```

**Response:**
```json
{
  "status": true,
  "message": "User updated successfully",
  "data": { /* updated user object */ }
}
```

### 2. Get Available Status Transitions
```
GET /admin/user/:userId/status-transitions
```
**Response:**
```json
{
  "status": true,
  "message": "Available transitions retrieved successfully",
  "data": {
    "currentStatus": "WAITING",
    "availableTransitions": ["ACTIVE", "REJECT", "INACTIVE"],
    "transitions": [
      {
        "value": "ACTIVE",
        "label": "Active",
        "requiresNote": false
      },
      {
        "value": "REJECT",
        "label": "Reject",
        "requiresNote": true
      },
      {
        "value": "INACTIVE",
        "label": "Inactive",
        "requiresNote": true
      }
    ]
  }
}
```

### 3. Bulk Status Update
```
PATCH /admin/bulk-update-user-status
```
**Request Body:**
```json
{
  "userIds": [123, 124, 125],
  "status": "ACTIVE",
  "statusNote": "Bulk approval for verified accounts"
}
```

## Database Schema Changes

### New Fields
- `statusNote` (TEXT, nullable) - Stores reason for status change

### Updated Fields
- `status` enum now includes WAITING, REJECT
- Default status changed from INACTIVE to WAITING

## Validation Rules

### Status Note Requirements
- **REJECT** status requires a status note
- **INACTIVE** status requires a status note
- **ACTIVE** and **WAITING** statuses don't require notes

### Business Rules
- Only admins can change user statuses
- Status changes are logged for audit purposes
- Invalid transitions are rejected with clear error messages

## Migration Guide

### 1. Update Prisma Schema
```bash
# After updating schema.prisma
npx prisma generate
```

### 2. Run Database Migration
```bash
# Option 1: Use the provided SQL script
psql -d your_database -f prisma/migrations/add_new_statuses.sql

# Option 2: Use Prisma migrate (recommended)
npx prisma migrate dev --name add_new_statuses
```

### 3. Update Existing Users
```sql
-- Update existing INACTIVE users to WAITING
UPDATE "User" SET "status" = 'WAITING' WHERE "status" = 'INACTIVE' AND "deletedAt" IS NULL;
```

## Frontend Integration

### Status Display
Use the `StatusDisplayBadge` component to display user statuses with appropriate colors and icons.

### Status Actions
Implement action buttons based on available transitions:
- Show approve button for WAITING users
- Show reject/deactivate buttons for ACTIVE users
- Show re-approve button for REJECT/INACTIVE users

### Status Filtering
Implement status-based filtering in user lists to show users by their current status.

## Error Handling

### Common Error Responses
```json
{
  "status": false,
  "message": "Cannot transition from ACTIVE to WAITING",
  "data": []
}
```

### Validation Errors
- Invalid status values
- Invalid status transitions
- Missing required fields (userId, status)
- User not found

## Audit Logging

### Current Implementation
- Status changes are logged to console
- Includes user ID, old status, new status, note, and admin ID

### Future Enhancements
- Implement proper audit table
- Add timestamp and IP address tracking
- Export audit logs for compliance

## Testing

### Test Cases
1. **Valid Transitions**
   - WAITING → ACTIVE
   - WAITING → REJECT (with note)
   - ACTIVE → INACTIVE (with note)

2. **Invalid Transitions**
   - ACTIVE → WAITING (should fail)
   - REJECT → WAITING (should fail)

3. **Required Fields**
   - REJECT without note (should fail)
   - INACTIVE without note (should fail)

4. **Edge Cases**
   - Non-existent user ID
   - Invalid status values
   - Missing required fields

## Security Considerations

### Access Control
- All status update endpoints require admin authentication
- Use `SuperAdminAuthGuard` for protection

### Input Validation
- Validate status values against enum
- Sanitize status notes to prevent injection
- Rate limiting for bulk operations

### Audit Trail
- Log all status changes
- Track who made changes and when
- Maintain history for compliance

## Performance Considerations

### Database Indexes
```sql
-- Add indexes for better performance
CREATE INDEX idx_user_status ON "User"("status");
CREATE INDEX idx_user_status_note ON "User"("status", "statusNote");
```

### Bulk Operations
- Use transactions for bulk updates
- Implement batch processing for large datasets
- Add progress tracking for long-running operations

## Troubleshooting

### Common Issues

1. **Enum Type Errors**
   - Ensure database enum matches Prisma schema
   - Run migrations in correct order

2. **Status Transition Failures**
   - Check current user status
   - Verify transition rules
   - Ensure required notes are provided

3. **Permission Denied**
   - Verify admin authentication
   - Check guard configuration
   - Ensure proper role assignment

### Debug Mode
Enable debug logging in admin service:
```typescript
console.log('Status transition:', { from: oldStatus, to: newStatus, valid: isValidTransition });
```

## Future Enhancements

### Planned Features
1. **Status Workflows**
   - Multi-step approval processes
   - Automatic status transitions
   - Conditional status requirements

2. **Advanced Notifications**
   - Email notifications for status changes
   - SMS alerts for critical updates
   - In-app notification system

3. **Status Templates**
   - Predefined status notes
   - Custom status categories
   - Status-based permissions

4. **Analytics Dashboard**
   - Status change trends
   - Approval/rejection rates
   - User activity metrics

## Support

For questions or issues related to the status system:
1. Check this documentation
2. Review error logs
3. Contact the development team
4. Create an issue in the project repository
