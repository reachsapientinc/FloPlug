// functions/src/scripts/seedSettings.cjs
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const serviceAccount = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "./floplug-dev-serviceAccountKey.json"),
    "utf-8"
  )
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const seed = async () => {
  await admin.firestore()
    .collection("FloPlugGlobalSettings")
    .doc("StorageSettings")
    .set({
      buckets: {
        schemas: {
          bucketName: "floplug-dev",
          folder: "schemas",
          retentionDays: 365,
          allowedTypes: ["wsdl", "xsd", "json", "yaml", "yml"],
          maxFileSizeMB: 50,
        },
        brandAssets: {
          bucketName: "floplug-dev",
          folder: "brand-assets",
          retentionDays: -1,
          allowedTypes: ["png", "jpg", "jpeg", "svg", "webp"],
          maxFileSizeMB: 10,
        },
      },
    });

  console.log("✓ StorageSettings seeded");
  process.exit(0);
};

seed().catch(console.error);