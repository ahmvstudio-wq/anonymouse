import crypto from 'crypto';

export interface EncryptedData {
  encryptedData: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

export function encryptIdentity(name: string, email: string): EncryptedData {
  const keyHex = process.env.IDENTITY_ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error('IDENTITY_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
  const key = Buffer.from(keyHex, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  const data = JSON.stringify({ name, email });
  const encryptedData = Buffer.concat([
    cipher.update(data, 'utf8'),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();

  return { encryptedData, iv, authTag };
}

export function decryptIdentity(encryptedData: Buffer, iv: Buffer, authTag: Buffer): { name: string; email: string } {
  const keyHex = process.env.IDENTITY_ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error('IDENTITY_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
  const key = Buffer.from(keyHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encryptedData),
    decipher.final()
  ]);

  return JSON.parse(decrypted.toString('utf8'));
}
