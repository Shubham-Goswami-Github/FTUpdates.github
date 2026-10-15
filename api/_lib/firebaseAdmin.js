import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function getAdminApp() {
  const existingApps = getApps();

  if (existingApps.length > 0) {
    return existingApps[0];
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin environment variables are missing."
    );
  }

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
    projectId,
  });
}

export function adminAuth() {
  return getAuth(getAdminApp());
}

export function adminDb() {
  return getFirestore(getAdminApp());
}

export async function requireAdmin(req) {
  const authorizationHeader = req.headers.authorization || "";
  const tokenMatch = authorizationHeader.match(/^Bearer\s+(.+)$/i);

  if (!tokenMatch) {
    const error = new Error("Authentication required.");
    error.status = 401;
    throw error;
  }

  const decodedToken = await adminAuth().verifyIdToken(tokenMatch[1]);

  if (decodedToken.admin !== true) {
    const error = new Error("Admin access required.");
    error.status = 403;
    throw error;
  }

  return decodedToken;
}

export function sendMethodNotAllowed(res) {
  res.setHeader("Allow", "POST");

  return res.status(405).json({
    error: "Method not allowed.",
  });
}
