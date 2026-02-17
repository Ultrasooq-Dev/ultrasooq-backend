/**
 * @file s3.service.ts — AWS S3 File Storage Service
 *
 * @intent
 *   Provides methods for uploading, deleting, and generating presigned URLs for
 *   files stored in AWS S3. Used across the application for profile pictures,
 *   product images, chat attachments, and other user-uploaded content.
 *
 * @idea
 *   Centralizes all S3 interactions in a single service. Each method creates
 *   an S3 client instance via getS3(), then performs the requested operation.
 *   Files are uploaded with public-read ACL, meaning they are accessible via
 *   their S3 URL without authentication.
 *
 * @usage
 *   - Provided by UserModule and also imported in AppModule as a standalone module.
 *   - Injected into:
 *     • UserController — presignedUrlUpload, presignedUrlUploadMultiple endpoints.
 *     • UserService — presignedUrlDelete, profile picture management.
 *     • ProductController / other services that handle file uploads.
 *   - S3 bucket and region are configured via environment variables:
 *     AWS_BUCKET, AWS_LOCATION (region).
 *
 * @dataflow
 *   Controller receives file (multipart) → passes buffer to s3_upload/s3_uploadMulti
 *   → S3 SDK uploads to bucket → returns public URL (s3Response.Location).
 *   For deletion: key passed to s3_deleteObject → S3 removes the object.
 *   For downloads: key passed to getPresignedUrl → returns time-limited signed URL.
 *
 * @depends
 *   - aws-sdk (S3 — AWS SDK v2)
 *   - file-type (imported but unused in active methods)
 *   - Environment variables: AWS_BUCKET, AWS_LOCATION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 *
 * @notes
 *   - AWS credentials (accessKeyId, secretAccessKey) are loaded from
 *     environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY).
 *   - The class is NOT decorated with @Injectable() or @Module(), yet it's
 *     used as both a provider and an import in AppModule. NestJS may handle
 *     this through its DI system, but it's unconventional.
 *   - s3Upload (base64) method is incomplete — the upload call is commented out.
 *   - determineMimeType() is a standalone utility function, not a class method.
 *   - ACL: 'public-read' makes all uploads publicly accessible via URL.
 */

import { S3 } from 'aws-sdk';
import fileType from 'file-type';
import { BadRequestException } from '@nestjs/common';
import { getErrorMessage } from 'src/common/utils/get-error-message';

const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
  document: ['application/pdf', 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  video: ['video/mp4', 'video/webm'],
};

const MAX_FILE_SIZES: Record<string, number> = {
  image: 5 * 1024 * 1024,      // 5MB
  document: 20 * 1024 * 1024,   // 20MB
  video: 100 * 1024 * 1024,     // 100MB
};

export class S3service {
  /**
   * getS3 — Creates and returns a configured AWS S3 client instance.
   *
   * @returns S3 client connected to the configured AWS region.
   *
   * @notes AWS credentials are loaded from environment variables
   *        (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY).
   */
  async getS3() {
    return new S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_LOCATION,
    });
  }

  /**
   * validateFile — Validates file MIME type, size, and extension before upload.
   *
   * @param file     - Express.Multer.File object containing mimetype, size, and originalname.
   * @throws BadRequestException if the file type is not allowed, file size exceeds
   *         the limit for its category, or the file extension is dangerous.
   */
  private validateFile(file: Express.Multer.File): void {
    const allAllowed = Object.values(ALLOWED_MIME_TYPES).flat();
    if (!allAllowed.includes(file.mimetype)) {
      throw new BadRequestException(`File type ${file.mimetype} is not allowed. Allowed types: ${allAllowed.join(', ')}`);
    }

    // Determine category
    const category = Object.entries(ALLOWED_MIME_TYPES).find(([_, types]) => types.includes(file.mimetype))?.[0] || 'document';
    const maxSize = MAX_FILE_SIZES[category] || MAX_FILE_SIZES.document;

    if (file.size > maxSize) {
      throw new BadRequestException(`File size ${(file.size / 1024 / 1024).toFixed(1)}MB exceeds maximum ${(maxSize / 1024 / 1024).toFixed(0)}MB for ${category} files`);
    }

    // Check extension matches MIME type
    const ext = file.originalname.split('.').pop()?.toLowerCase();
    const dangerousExtensions = ['exe', 'bat', 'cmd', 'sh', 'ps1', 'msi', 'dll', 'com', 'scr', 'js', 'vbs', 'wsf', 'php', 'py', 'rb', 'pl'];
    if (ext && dangerousExtensions.includes(ext)) {
      throw new BadRequestException(`File extension .${ext} is not allowed for security reasons`);
    }
  }

  /**
   * s3_upload — Uploads a single file (image/video) to S3.
   *
   * @param file     - File buffer (from multer via @UploadedFiles()).
   * @param path     - S3 key/path where the file will be stored (e.g., "public/123/image.jpg").
   * @param mimetype - MIME type of the file (e.g., "image/jpeg").
   * @param originalFile - Original Multer file object for validation (optional for backward compatibility).
   * @returns { status: true, message, data: publicUrl } on success,
   *          { status: false, message: errorMsg } on failure.
   *
   * @usage Called by UserController.presignedUrlUpload() for single file uploads.
   * @notes Commented-out code shows earlier attempts at presigned URLs and
   *        alternative content-type detection approaches.
   */
  // used for single image/video upload
  async s3_upload(file, path, mimetype, originalFile?: Express.Multer.File) {
    if (originalFile) {
      this.validateFile(originalFile);
    }
    const s3 = await this.getS3();


    const contentType = mimetype

    const uploadParams = {
      Bucket: process.env.AWS_BUCKET, //'puremoon',
      Key: path,
      Body: file,
      ContentType: contentType,
      ACL: 'public-read',
      ContentDisposition: 'inline',
    };
    try {
      let s3Response = await s3.upload(uploadParams).promise()
      return {
        status: true,
        message: 'Uploaded Successfully',
        data: s3Response.Location,
      };

    } catch (error) {
      return {
        status: false,
        message: getErrorMessage(error),
      };
    }
  }

  /**
   * s3_uploadMulti — Uploads a single file to S3 and returns only the URL string.
   *
   * @param file     - File buffer.
   * @param path     - S3 key/path.
   * @param mimetype - MIME type.
   * @returns The S3 public URL string on success, or { status: false, message } on error.
   *
   * @usage Called in a loop by UserController.presignedUrlUploadMultiple() for
   *        batch uploads. Returns just the URL (not wrapped in status object)
   *        so the caller can aggregate URLs into an array.
   *
   * @notes Despite the name "Multi", this uploads one file at a time. The "multi"
   *        refers to its use context (called in a loop), not parallel uploads.
   */
  // used for multiple image/Video upload
  async s3_uploadMulti(file, path, mimetype, originalFile?: Express.Multer.File) {
    if (originalFile) {
      this.validateFile(originalFile);
    }
    const s3 = await this.getS3();

    const contentType = mimetype

    const uploadParams = {
      Bucket: process.env.AWS_BUCKET, //'puremoon',
      Key: path,
      Body: file,
      ContentType: contentType,
      ACL: 'public-read',
      ContentDisposition: 'inline',
    };
    try {
      let s3Response = await s3.upload(uploadParams).promise()
      return s3Response.Location

    } catch (error) {
      return {
        status: false,
        message: getErrorMessage(error),
      };
    }
  }

  /**
   * s3_deleteObject — Deletes a single object from S3 by its key.
   *
   * @param payload - Object containing `key`: the S3 object key to delete.
   * @returns { status: true, message: 'Deleted Successfully' } or
   *          { status: false, message: 'Not Deleted' }.
   *
   * @usage Called by UserService.presignedUrlDelete() when users remove files
   *        (e.g., product images, profile pictures, attachments).
   */
  async s3_deleteObject(payload) {
    const s3 = await this.getS3();

    // Specify the bucket name and object key (path) to delete
    const bucketName = process.env.AWS_BUCKET;
    const objectKey = payload?.key; // This is the path of the object you want to delete

    // Set the parameters for the deleteObject operation
    const params = {
      Bucket: bucketName,
      Key: objectKey,
    };

    // Delete the object from S3
    try {
      // Delete the object from S3
      const data = await s3.deleteObject(params).promise();

      return {
        status: true,
        message: 'Deleted Successfully'
      };
    } catch (err) {
      return {
        status: false,
        message: 'Not Deleted'
      };
    }
  }

  /**
   * s3Upload — INCOMPLETE: Intended for base64 image upload to S3.
   *
   * @param base64Image - Base64-encoded image string (with or without data URI prefix).
   * @param userId      - User ID for constructing the S3 path.
   * @returns Nothing useful — the upload call is commented out.
   *
   * @notes This method is INCOMPLETE / dead code. The actual s3.upload() call
   *        is commented out, and the uploadParams object lacks Key and Body.
   *        It appears to be an abandoned implementation for base64 image uploads.
   */
  async s3Upload(base64Image, userId) {
    const s3 = await this.getS3();

    // Decode base64 image to binary data
    const binaryData = Buffer.from(base64Image.replace(/^data:image\/[a-z]+;base64,/, ''), 'base64');

    const uploadParams = {
      Bucket: process.env.AWS_BUCKET,
      ACL: 'public-read',
      ContentDisposition: 'inline',
    };

    try {

    } catch (error) {
      return {
        status: false,
        message: getErrorMessage(error),
      };
    }

  }

    /**
     * getPresignedUrl — Generates a time-limited presigned URL for downloading a file from S3.
     *
     * @param fileKey - The S3 object key of the file to generate a URL for.
     * @returns Presigned URL string (valid for 5 minutes), or null if the file doesn't exist.
     * @throws Error if the headObject check fails for reasons other than "NotFound".
     *
     * @usage Called when a secure, temporary download link is needed (e.g., for
     *        chat attachments that shouldn't have permanent public URLs).
     *
     * @dataflow
     *   1. headObject() — checks if the file exists in S3.
     *   2. If exists → getSignedUrl() with 5-minute expiry and 'attachment' disposition.
     *   3. If not found → returns null.
     *
     * @notes The presigned URL forces download via ResponseContentDisposition: 'attachment'.
     *        The 5-minute (300s) expiry window is relatively short.
     */
    // Generate a presigned URL for downloading a file
    async getPresignedUrl(fileKey: string): Promise<string> {
      const s3 = await this.getS3();
            const params = {
        Bucket: process.env.AWS_BUCKET,
        Key: fileKey,
      };
      try {
        await s3.headObject(params).promise();
        const urlParams = {
          Bucket: process.env.AWS_BUCKET,
          Key: fileKey,
          Expires: 60 * 5,
          ResponseContentDisposition: 'attachment' 
        };
        return s3.getSignedUrl('getObject', urlParams);
      } catch (error) {
        if (error.code === 'NotFound') {
            return null;
        } else {
          throw new Error(`Error checking file existence: ${getErrorMessage(error)}`);
        }
      }
    }
}

/**
 * determineMimeType — Detects MIME type from a binary buffer's magic bytes.
 *
 * @param buffer - Binary buffer to inspect.
 * @returns MIME type string (e.g., "image/png") or "application/octet-stream" as fallback.
 *
 * @notes This is a standalone utility function (not a class method). It checks
 *        the first 8 bytes of the buffer against known file signatures (magic
 *        numbers). Only supports PNG, GIF, and JPEG. This function appears to
 *        be unused in the current codebase — s3_upload uses the mimetype parameter
 */
function determineMimeType(buffer) {
  const signatures = [
    { hex: "89504e470d0a1a0a", mime: "image/png" },
    { hex: "474946383961", mime: "image/gif" },
    { hex: "474946383761", mime: "image/gif" },
    { hex: "ffd8ffe000104a464946", mime: "image/jpeg" },
    { hex: "ffd8ffe1001845786966", mime: "image/jpeg" },
    // Add more MIME types as needed
  ];

  // Convert buffer to a hexadecimal string
  const hexString = buffer.toString("hex", 0, 8);

  // Check the first 8 bytes against known signatures
  for (const signature of signatures) {
    if (hexString.startsWith(signature.hex)) {
      return signature.mime;
    }
  }

  return 'application/octet-stream';
}

