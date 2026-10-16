import { adminDb } from "./_lib/firebaseAdmin.js";

const APP_ID = "com.cscorner.financetracker";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      error: "Method not allowed."
    });
  }

  try {
    const snapshot = await adminDb()
      .collection("appReleases")
      .where("appId", "==", APP_ID)
      .where("status", "==", "published")
      .get();

    if (snapshot.empty) {
      return res.status(404).json({
        error: "No published release found."
      });
    }

    const releases = snapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data()
      }))
      .filter((release) => {
        return (
          Number.isInteger(Number(release.versionCode)) &&
          Number(release.versionCode) > 0 &&
          typeof release.versionName === "string" &&
          typeof release.apkUrl === "string" &&
          release.apkUrl.startsWith("https://")
        );
      })
      .sort(
        (a, b) =>
          Number(b.versionCode) - Number(a.versionCode)
      );

    if (releases.length === 0) {
      return res.status(422).json({
        error: "No valid published release is configured."
      });
    }

    const latest = releases[0];

    return res.status(200).json({
      appId: APP_ID,
      versionName: latest.versionName,
      versionCode: Number(latest.versionCode),
      minVersionCode: Number(latest.minVersionCode || 1),
      mandatory: latest.mandatory === true,
      releaseNotes: latest.releaseNotes || "",
      apkUrl: latest.apkUrl,
      publishedAt: latest.createdAt?.toDate
        ? latest.createdAt.toDate().toISOString()
        : null
    });
  } catch (error) {
    console.error("Latest release error:", error);

    return res.status(500).json({
      error: "Could not read latest release."
    });
  }
}