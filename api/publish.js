import { adminDb, requireAdmin } from "./_lib/firebaseAdmin.js";

const APP_ID = "com.cscorner.financetracker";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const user = await requireAdmin(req);

    const {
      versionName,
      versionCode,
      minVersionCode,
      releaseNotes,
      mandatory,
      apkUrl,
      apkPublicId,
      apkBytes
    } = req.body || {};

    const code = Number(versionCode);
    const minCode = Number(minVersionCode);
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;

    if (
      typeof versionName !== "string" ||
      !versionName.trim() ||
      versionName.trim().length > 50
    ) {
      return res.status(400).json({ error: "Invalid version name." });
    }

    if (!Number.isSafeInteger(code) || code < 1) {
      return res.status(400).json({ error: "Invalid version code." });
    }

    if (
      !Number.isSafeInteger(minCode) ||
      minCode < 1 ||
      minCode > code
    ) {
      return res.status(400).json({
        error: "Minimum version code must be between 1 and the new version code."
      });
    }

    if (
      typeof releaseNotes !== "string" ||
      releaseNotes.length > 5000
    ) {
      return res.status(400).json({ error: "Invalid release notes." });
    }

    if (typeof mandatory !== "boolean") {
      return res.status(400).json({ error: "Invalid mandatory flag." });
    }

    const expectedPublicId = `finance-tracker-apks/finance-tracker-${code}`;

    if (apkPublicId !== expectedPublicId) {
      return res.status(400).json({ error: "Unexpected APK public ID." });
    }

    let parsedUrl;

    try {
      parsedUrl = new URL(apkUrl);
    } catch {
      return res.status(400).json({ error: "Invalid APK URL." });
    }

    if (
      parsedUrl.protocol !== "https:" ||
      parsedUrl.hostname !== "res.cloudinary.com" ||
      !parsedUrl.pathname.includes(`/${cloudName}/raw/upload/`) ||
      !parsedUrl.pathname.endsWith(".apk")
    ) {
      return res.status(400).json({
        error: "APK URL must point to the expected Cloudinary raw APK."
      });
    }

    if (
      !Number.isSafeInteger(Number(apkBytes)) ||
      Number(apkBytes) <= 0
    ) {
      return res.status(400).json({ error: "Invalid APK file size." });
    }

    const db = adminDb();
    const releases = db.collection("appReleases");

    const result = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(
        releases
          .where("appId", "==", APP_ID)
          .where("status", "==", "published")
      );

      const highestCode = snapshot.docs.reduce(
        (highest, doc) => Math.max(highest, Number(doc.data().versionCode) || 0),
        0
      );

      if (code <= highestCode) {
        const error = new Error(
          `Version code must be greater than the latest published code (${highestCode}).`
        );
        error.status = 409;
        throw error;
      }

      const ref = releases.doc();

      transaction.create(ref, {
        appId: APP_ID,
        versionName: versionName.trim(),
        versionCode: code,
        minVersionCode: minCode,
        releaseNotes: releaseNotes.trim(),
        mandatory,
        apkUrl: parsedUrl.toString(),
        apkPublicId,
        apkBytes: Number(apkBytes),
        status: "published",
        createdBy: user.email || user.uid,
        createdAt: new Date()
      });

      return { id: ref.id };
    });

    return res.status(201).json({
      success: true,
      id: result.id,
      versionName: versionName.trim(),
      versionCode: code
    });
  } catch (error) {
    const status = error.status || 500;

    if (status === 500) {
      console.error("Publish error:", error.message);
    }

    return res.status(status).json({
      error: status === 500 ? "Could not publish release." : error.message
    });
  }
}