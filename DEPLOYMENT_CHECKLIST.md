# Deployment Checklist - New Status System

## Pre-Deployment Checklist

### 1. Code Review ✅
- [ ] All new endpoints reviewed and approved
- [ ] Status validation logic tested
- [ ] Error handling implemented
- [ ] Security measures in place

### 2. Database Changes ✅
- [ ] Prisma schema updated with new statuses (WAITING, ACTIVE, REJECT, INACTIVE, WAITING_FOR_SUPER_ADMIN)
- [ ] Migration script created and tested
- [ ] Backup of production database completed
- [ ] Rollback plan prepared

### 3. Testing ✅
- [ ] Unit tests written and passing
- [ ] Integration tests completed
- [ ] API endpoints tested with Postman/Insomnia
- [ ] Error scenarios tested
- [ ] Performance testing completed

### 4. Documentation ✅
- [ ] API documentation updated
- [ ] Status system README created
- [ ] Migration guide documented
- [ ] Frontend integration guide ready

## Deployment Steps

### Phase 1: Database Migration
1. **Stop Application**
   ```bash
   # Stop the running application
   pm2 stop puremoon-backend
   # or
   systemctl stop puremoon-backend
   ```

2. **Backup Database**
   ```bash
   pg_dump -h localhost -U username -d database_name > backup_$(date +%Y%m%d_%H%M%S).sql
   ```

3. **Run Migration**
   ```bash
   # Option 1: Use SQL script
   psql -h localhost -U username -d database_name -f prisma/migrations/add_new_statuses.sql
   
   # Option 2: Use Prisma (recommended)
   npx prisma migrate deploy
   ```

4. **Verify Migration**
   ```sql
   -- Check new statuses exist
   SELECT unnest(enum_range(NULL::"Status"));
   
   -- Check statusNote column exists
   \d "User"
   ```

### Phase 2: Application Update
1. **Deploy New Code**
   ```bash
   git pull origin main
   npm install
   npx prisma generate
   ```

2. **Build Application**
   ```bash
   npm run build
   ```

3. **Start Application**
   ```bash
   pm2 start puremoon-backend
   # or
   systemctl start puremoon-backend
   ```

### Phase 3: Verification
1. **Health Check**
   ```bash
   curl http://localhost:3000/health
   ```

2. **Test New Endpoints**
   ```bash
   # Test status transitions endpoint
   curl -H "Authorization: Bearer YOUR_TOKEN" \
        http://localhost:3000/admin/user/1/status-transitions
   
   # Test status update endpoint
   curl -X PATCH \
        -H "Authorization: Bearer YOUR_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"userId": 1, "status": "ACTIVE"}' \
        http://localhost:3000/admin/updateOneUser
   ```

3. **Check Logs**
   ```bash
   pm2 logs puremoon-backend
   # or
   journalctl -u puremoon-backend -f
   ```

## Post-Deployment Checklist

### 1. Monitoring ✅
- [ ] Application logs showing no errors
- [ ] Database queries executing successfully
- [ ] Response times within acceptable limits
- [ ] Memory and CPU usage normal

### 2. Functionality ✅
- [ ] New status system working correctly
- [ ] Status transitions validated properly
- [ ] Required notes enforced for REJECT/INACTIVE
- [ ] Bulk operations working as expected
- [ ] Audit logging functioning

### 3. Integration ✅
- [ ] Frontend can connect to new endpoints
- [ ] Status display working correctly
- [ ] Action buttons functioning properly
- [ ] Status filtering operational

### 4. Data Integrity ✅
- [ ] Existing users migrated to new statuses
- [ ] No data loss during migration
- [ ] Status history maintained
- [ ] Foreign key relationships intact

## Rollback Plan

### If Issues Occur:
1. **Stop Application**
   ```bash
   pm2 stop puremoon-backend
   ```

2. **Rollback Database**
   ```bash
   # Restore from backup
   psql -h localhost -U username -d database_name < backup_file.sql
   ```

3. **Revert Code**
   ```bash
   git reset --hard HEAD~1
   npm install
   npx prisma generate
   ```

4. **Restart Application**
   ```bash
   pm2 start puremoon-backend
   ```

## Performance Considerations

### 1. Database Indexes
```sql
-- Add these indexes for better performance
CREATE INDEX CONCURRENTLY idx_user_status ON "User"("status");
CREATE INDEX CONCURRENTLY idx_user_status_note ON "User"("status", "statusNote");
CREATE INDEX CONCURRENTLY idx_user_master_account ON "User"("masterAccountId");
```

### 2. Monitoring Queries
```sql
-- Monitor slow queries
SELECT query, mean_time, calls 
FROM pg_stat_statements 
WHERE mean_time > 100 
ORDER BY mean_time DESC;
```

### 3. Connection Pool
```typescript
// Ensure proper connection pool configuration
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: ['query', 'info', 'warn', 'error'],
})
```

## Security Checklist

### 1. Authentication ✅
- [ ] All endpoints protected with SuperAdminAuthGuard
- [ ] JWT tokens validated properly
- [ ] Rate limiting implemented

### 2. Input Validation ✅
- [ ] Status values validated against enum
- [ ] User IDs validated for existence
- [ ] Status notes sanitized
- [ ] SQL injection prevention

### 3. Audit Trail ✅
- [ ] All status changes logged
- [ ] Admin actions tracked
- [ ] Timestamps recorded
- [ ] IP addresses logged (if available)

## Communication Plan

### 1. Stakeholder Notification
- [ ] Development team informed
- [ ] QA team notified
- [ ] Product owner updated
- [ ] Support team briefed

### 2. Documentation Updates
- [ ] API documentation published
- [ ] Status system guide shared
- [ ] Migration notes distributed
- [ ] Troubleshooting guide ready

### 3. Training
- [ ] Admin users trained on new system
- [ ] Support team briefed on common issues
- [ ] Documentation reviewed by stakeholders

## Success Criteria

### 1. Technical ✅
- [ ] All new endpoints responding correctly
- [ ] Status transitions working as designed
- [ ] Performance within acceptable limits
- [ ] No critical errors in logs

### 2. Business ✅
- [ ] User approval workflow improved
- [ ] Admin efficiency increased
- [ ] Status tracking enhanced
- [ ] Compliance requirements met

### 3. User Experience ✅
- [ ] Frontend integration seamless
- [ ] Status changes intuitive
- [ ] Error messages clear
- [ ] Performance satisfactory

## Maintenance Plan

### 1. Regular Monitoring
- [ ] Daily log review
- [ ] Weekly performance check
- [ ] Monthly status transition analysis
- [ ] Quarterly security review

### 2. Updates and Improvements
- [ ] Collect user feedback
- [ ] Monitor system usage
- [ ] Plan future enhancements
- [ ] Update documentation as needed

### 3. Backup and Recovery
- [ ] Daily database backups
- [ ] Weekly full system backup
- [ ] Monthly disaster recovery test
- [ ] Quarterly backup restoration test
