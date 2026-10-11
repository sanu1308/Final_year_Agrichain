import os from 'os';
import QRCode from 'qrcode';
import { config } from '../config/index.js';

/**
 * Robustly detects the host machine's active LAN IPv4 address.
 * Filters out loopback (127.0.0.1), link-local (169.254.x.x), and virtual/container
 * adapters (Docker, WSL, Hyper-V, VMware, VirtualBox, etc.).
 * Prioritizes standard private network ranges (10.x.x.x, 192.168.x.x, 172.16-31.x.x)
 * on physical adapters (Wi-Fi, Ethernet).
 */
export function getLanIpAddress() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  const virtualPattern = /docker|veth|vmware|virtual|wsl|hyper-v|vethernet|loopback|utun|tap|tun|bridge/i;
  const preferredNamePattern = /wi-fi|wifi|wireless|wlan|ethernet|eth|en\d/i;
  const privateIpPattern = /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/;

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    const isVirtual = virtualPattern.test(name);
    const isPreferredName = preferredNamePattern.test(name);

    for (const iface of addrs) {
      const isIPv4 = iface.family === 'IPv4' || iface.family === 4;
      if (!isIPv4 || iface.internal) continue;

      const ip = iface.address;
      // Skip loopback and APIPA / link-local addresses
      if (ip.startsWith('127.') || ip.startsWith('169.254.')) continue;

      const isPrivate = privateIpPattern.test(ip);

      let score = 0;
      if (!isVirtual) score += 10;
      if (isPreferredName) score += 10;
      if (isPrivate) score += 20;

      candidates.push({ ip, name, score });
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].ip;
}

export class QRCodeService {
  /**
   * Returns the base verification URL for QR code generation.
   *
   * In Production (NODE_ENV === 'production'):
   *   Strictly uses PUBLIC_CLIENT_URL > CLIENT_URL > fallback production URL.
   *   Ensures no private LAN addresses are exposed in production.
   *
   * In Development (NODE_ENV !== 'production'):
   *   1. Uses LOCAL_CLIENT_URL if explicitly provided in environment.
   *   2. Otherwise automatically determines laptop's LAN IPv4 address (http://<LAN_IP>:5173).
   *   3. Falls back to CLIENT_URL / localhost only if no LAN IP can be found.
   */
  static getBaseVerifyUrl() {
    const isProduction = config.nodeEnv === 'production';

    // 1. Production Mode
    if (isProduction) {
      if (!config.publicClientUrl) {
        throw new Error(
          'PUBLIC_CLIENT_URL must be configured in production before generating consumer QR codes.'
        );
      }

      const cleanUrl = config.publicClientUrl.replace(/\/+$/, '');
      let parsedUrl;
      try {
        parsedUrl = new URL(cleanUrl);
      } catch {
        throw new Error('PUBLIC_CLIENT_URL must be a valid public HTTP(S) URL.');
      }

      const hostname = parsedUrl.hostname.toLowerCase();
      const isPrivateOrLocal =
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        /^10\./.test(hostname) ||
        /^192\.168\./.test(hostname) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);

      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        throw new Error('PUBLIC_CLIENT_URL must use HTTP or HTTPS.');
      }

      if (isPrivateOrLocal) {
        throw new Error(
          'PUBLIC_CLIENT_URL must not use localhost or a private LAN address in production.'
        );
      }

      return cleanUrl;
    }

    // 2. Development Mode
    // Check for explicit override first
    if (config.localClientUrl) {
      return config.localClientUrl.replace(/\/+$/, '');
    }

    // Automatically detect LAN IP
    const lanIp = getLanIpAddress();
    if (lanIp) {
      let port = '5173';
      try {
        if (config.clientUrl) {
          const parsed = new URL(config.clientUrl);
          if (parsed.port) {
            port = parsed.port;
          }
        }
      } catch (e) {
        // use default port 5173
      }

      return `http://${lanIp}:${port}`;
    }

    // Fallback if no network interface is available
    const fallbackUrl = config.clientUrl || 'http://localhost:5173';
    return fallbackUrl.replace(/\/+$/, '');
  }

  /**
   * Generates a base64 Data URL representing a QR code
   * that points directly to the consumer public verification route.
   */
  static async generateBatchQRCode(blockchainBatchId) {
    const verifyUrl = `${this.getBaseVerifyUrl()}/verify/${blockchainBatchId}`;
    try {
      const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
        errorCorrectionLevel: 'H',
        margin: 2,
        width: 350,
        color: {
          dark: '#14532d', // deep emerald green
          light: '#ffffff',
        },
      });
      return qrDataUrl;
    } catch (err) {
      console.error('Error generating QR code:', err);
      throw new Error('Failed to generate batch QR code');
    }
  }

  /**
   * Generates raw SVG string for high-resolution printing
   */
  static async generateBatchQRSVG(blockchainBatchId) {
    const verifyUrl = `${this.getBaseVerifyUrl()}/verify/${blockchainBatchId}`;
    return QRCode.toString(verifyUrl, {
      type: 'svg',
      errorCorrectionLevel: 'H',
      margin: 1,
    });
  }
}
