import { v2 as cloudinary } from "cloudinary";
import {
  requireAdmin,
  sendMethodNotAllowed,
} from "./_lib/firebaseAdmin.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return sendMethodNotAllowed(res);
  }

  try {
    await requireAdmin(req);

    const { folder, public_id } = req.body || {};

    if (
      folder !== "finance-tracker-apks" ||
      !/^finance-tracker-\d+$/.test(public_id || "")
    ) {
      return res.status(400).json({
        error: "Invalid upload target.",
      });
    }

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error("Cloudinary environment variables are missing.");
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    });

    const timestamp = Math.floor(Date.now() / 1000);

    const params = {
      timestamp,
      folder,
      public_id,
    };

    const signature = cloudinary.utils.api_sign_request(
      params,
      apiSecret
    );

    return res.status(200).json({
      ...params,
      signature,
      cloudName,
      apiKey,
    });
  } catch (error) {
    console.error("Upload signature error:", error);

    const status = error.status || 500;

    return res.status(status).json({
      error:
        status === 401
          ? "Authentication required."
          : status === 403
          ? "Admin access required."
          : "Could not authorize upload.",
    });
  }
}
