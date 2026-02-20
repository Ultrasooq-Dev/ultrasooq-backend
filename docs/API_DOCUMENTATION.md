# UltraSooq Backend API Documentation

## 📚 API Documentation

The UltraSooq backend now has **comprehensive API documentation** available via Swagger/OpenAPI!

### 🌐 Access API Documentation

- **Swagger UI**: http://localhost:3000/api-docs
- **Status**: ✅ **Active and accessible**

### 📋 Available API Endpoints

Based on the application logs, here are the main API modules and their endpoints:

## 🔐 Authentication & Users
- `/user/*` - User management, registration, login, profiles
- `/admin/*` - Admin panel operations
- `/admin-member/*` - Admin member management

## 🛒 E-commerce Core
- `/product/*` - Product management, listings, reviews, questions
- `/category/*` - Product categories and navigation
- `/brand/*` - Brand management
- `/cart/*` - Shopping cart operations
- `/order/*` - Order processing and management
- `/wishlist/*` - User wishlist management

## 💳 Payments & Financial
- `/payment/*` - Payment processing (PayMob integration)
- `/stripe/*` - Stripe payment integration
- `/wallet/*` - Digital wallet system
- `/fees/*` - Fee management

## 🤝 Business Features
- **RFQ System**: `/rfq-product/*` - Request for Quote functionality
- **Services**: `/service/*` - Service marketplace
- **Chat**: `/chat/*` - Real-time messaging system
- **Team Management**: `/team-member/*` - Business team features

## 📊 Additional Features
- `/policy/*` - Terms, privacy, and policies
- `/notification/*` - Push notifications
- **File Management**: S3 integration for uploads
- **Status System**: Advanced user status management
- **Dropshipping**: Product dropshipping features
- **Wholesale**: Bulk purchase features

## 🔧 API Features

### Authentication
- **JWT Bearer Token** authentication
- Multiple user types and roles
- Admin and user-level permissions

### Real-time Features
- **WebSocket** support for chat and notifications
- Live order updates
- Real-time messaging

### File Handling
- **AWS S3** integration for file uploads
- Image optimization and processing
- Secure file download/access

### Payment Integration
- **Stripe** payment processing
- **PayMob** Middle East payment gateway
- Digital wallet system
- EMI/installment support

## 📝 API Usage Examples

### Basic Authentication
```bash
# Login
POST /user/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password"
}
```

### Product Operations
```bash
# Get all products
GET /product/findAll

# Create product (requires auth)
POST /product/create
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Product Name",
  "description": "Product Description",
  "categoryId": 1
}
```

### Order Management
```bash
# Create order
POST /order/createOrder
Authorization: Bearer <token>
Content-Type: application/json

{
  "products": [
    {
      "productId": 1,
      "quantity": 2
    }
  ]
}
```

## 🛠️ Development Information

### Environment
- **Framework**: NestJS with TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Cache**: Redis
- **File Storage**: AWS S3
- **Real-time**: Socket.IO
- **Documentation**: Swagger/OpenAPI

### Docker Setup
- **Development**: `http://localhost:3000`
- **API Docs**: `http://localhost:3000/api-docs`
- **Database**: PostgreSQL on port 5432
- **Cache**: Redis on port 6379

## 📋 Status System

The application includes an advanced status management system for users:

- `WAITING` - Initial registration state
- `ACTIVE` - Verified and active users
- `INACTIVE` - Temporarily disabled
- `REJECT` - Rejected applications
- `WAITING_FOR_SUPER_ADMIN` - Escalated reviews

## 💡 Testing

You can test the API using:

1. **Swagger UI**: Interactive testing at `http://localhost:3000/api-docs`
2. **HTTP files**: Use the provided `test-status-endpoints.http` file
3. **Postman/Insomnia**: Import the OpenAPI spec from Swagger
4. **curl/PowerShell**: Direct HTTP requests

## 🔗 Quick Links

- **API Documentation**: [http://localhost:3000/api-docs](http://localhost:3000/api-docs)
- **Main Application**: [http://localhost:3000](http://localhost:3000)
- **Health Check**: `GET /` (returns "Hello World!")

---

## 📞 Support

For API questions or integration help, refer to:
- Swagger documentation for endpoint details
- HTTP test files for example requests
- Docker setup documentation for environment configuration