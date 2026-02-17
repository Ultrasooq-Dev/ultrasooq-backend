# Scraper Service - Docker Setup Guide

## 🐳 Running Scraper in Docker

The scraper service is now configured to work in Docker containers with Chromium installed.

---

## 📋 Prerequisites Installed

The following dependencies have been added to your Dockerfiles:

### System Dependencies
- ✅ **Chromium** - Headless browser for scraping
- ✅ **NSS** - Network Security Services
- ✅ **FreeType** - Font rendering
- ✅ **HarfBuzz** - Text shaping
- ✅ **CA Certificates** - SSL/TLS certificates
- ✅ **TTF FreeFont** - TrueType fonts

### Environment Variables
```bash
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
```

---

## 🚀 Rebuild & Deploy

After the Dockerfile changes, you need to rebuild your Docker images:

### Development Environment

```bash
# Stop containers
docker-compose -f docker-compose.dev.yml down

# Rebuild images
docker-compose -f docker-compose.dev.yml build

# Start containers
docker-compose -f docker-compose.dev.yml up -d

# Or rebuild and start in one command
docker-compose -f docker-compose.dev.yml up -d --build
```

### Production Environment

```bash
# Rebuild production image
docker-compose build

# Start containers
docker-compose up -d

# Or rebuild and start in one command
docker-compose up -d --build
```

---

## ✅ Verification

Once your containers are running, test the scraper:

### 1. Check if service is running
```bash
docker-compose -f docker-compose.dev.yml logs app
```

### 2. Test the API endpoint
```bash
curl "http://localhost:3000/scraper/product?url=https://www.amazon.in/dp/B0CX59SMJ9"
```

Or open in browser:
```
http://localhost:3000/scraper/product?url=https://www.amazon.in/dp/B0CX59SMJ9
```

---

## 🐛 Troubleshooting

### Issue: "Cannot find module 'puppeteer'"
**Solution**: Rebuild the Docker image
```bash
docker-compose -f docker-compose.dev.yml build --no-cache
```

### Issue: "Failed to launch browser"
**Solution**: Make sure Chromium is installed in the container
```bash
# Check if Chromium is installed
docker-compose -f docker-compose.dev.yml exec app which chromium-browser
```

### Issue: Browser crashes or timeouts
**Solution**: Add more memory to Docker container
```yaml
# In docker-compose.dev.yml
app:
  deploy:
    resources:
      limits:
        memory: 2G
```

### Issue: "ECONNREFUSED" or network errors
**Solution**: Check if the app container can access the internet
```bash
docker-compose -f docker-compose.dev.yml exec app ping -c 3 amazon.in
```

---

## 📊 Resource Usage

Puppeteer/Chromium can be resource-intensive:

- **Memory**: ~200-500MB per browser instance
- **CPU**: Moderate during scraping
- **Disk**: ~150MB for Chromium installation

### Recommended Docker Resources
```yaml
app:
  deploy:
    resources:
      limits:
        cpus: '2'
        memory: 2G
      reservations:
        cpus: '0.5'
        memory: 512M
```

---

## 🔄 Auto-restart Configuration

The scraper is configured with `restart: unless-stopped` in docker-compose, so it will:
- ✅ Restart if it crashes
- ✅ Start automatically on system reboot
- ❌ Not restart if manually stopped

---

## 🎯 Best Practices

### 1. Headless Mode
Always use `headless: true` in Docker (already configured)

### 2. Browser Cleanup
The scraper automatically closes browsers after use

### 3. Error Handling
All errors are logged and thrown with context

### 4. Resource Limits
Consider setting Docker resource limits for production

---

## 📝 Files Modified

1. **Dockerfile.dev** - Added Chromium and dependencies
2. **Dockerfile** - Added Chromium for production
3. **amazon.in.scraper.provider.ts** - Configured for Docker
4. **taobao.scraper.provider.ts** - Configured for Docker

---

## 🔍 Checking Logs

View scraper logs in real-time:

```bash
# All logs
docker-compose -f docker-compose.dev.yml logs -f app

# Filter for scraper logs
docker-compose -f docker-compose.dev.yml logs -f app | grep -i scraper

# Filter for errors
docker-compose -f docker-compose.dev.yml logs -f app | grep -i error
```

---

## ✨ Next Steps

1. ✅ Rebuild Docker images
2. ✅ Start containers
3. ✅ Test scraper endpoint
4. ✅ Monitor logs for any issues
5. ✅ Integrate into your product service

---

## 🆘 Need Help?

If you encounter issues:

1. Check Docker logs: `docker-compose logs app`
2. Verify Chromium: `docker exec ultrasooq-backend-dev which chromium-browser`
3. Check environment variables: `docker exec ultrasooq-backend-dev env | grep PUPPETEER`
4. Test manually: `docker exec -it ultrasooq-backend-dev sh`

---

**The scraper is now Docker-ready! 🚀**
