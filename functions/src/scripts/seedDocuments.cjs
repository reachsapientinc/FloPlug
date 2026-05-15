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
    .doc("Permissions")
    .set({
      "manage:plugs": {        
          label: "Manage Plugs",
          description: "Create, edit and deactivate connector plugs",
          category: "plugs",
          isActive: true,
          sortOrder: 1,
        },
       "manage:users": {        
          label: "Manage Users",
          description: "Invite, edit and deactivate hub users",
          category: "users",
          isActive: true,
          sortOrder: 2,
        },
        "run:flows": {        
          label: "Run Flos",
          description: "Hit the Run button in the flow designer",
          category: "flos",
          isActive: true,
          sortOrder: 3,
        },
        "invoke:flows": {        
          label: "Invoke Flos",
          description: "Call flos via web service / API",
          category: "flos",
          isActive: true,
          sortOrder: 4,
        },
        "design:flows": {        
          label: "Design Flos",
          description: "Open the designer and edit flos",
          category: "flos",
          isActive: true,
          sortOrder: 5,
        },
        "view:logs": {        
          label: "View Logs",
          description: "View flow execution logs",
          category: "logs",
          isActive: true,
          sortOrder: 6,
        },
        "manage:settings": {        
          label: "Manage Settings",
          description: "Access hub-level settings",
          category: "settings",
          isActive: true,
          sortOrder: 7,
        },
      },
    );


  console.log("✓ Permissions seeded");

  await admin.firestore()
    .collection("FloPlugGlobalSettings")
    .doc("HubRoles")
    .set({
      "hub_admin": {        
          label: "Hub Admin",
          permissionIds:   [
           'manage:plugs', 'manage:users', 'run:flows',
           'invoke:flows', 'design:flows', 'view:logs', 'manage:settings'
         ],
          isActive: true,
          sortOrder: 1,
        },
        "user": {        
          label: "User",
          permissionIds:   ['design:flows', 'view:logs'],
          isActive: true,
          sortOrder: 2,
        },
    });

    console.log("✓ HubRoles seeded");

    await admin.firestore()
    .collection("FloPlugGlobalSettings")
    .doc("FloPlugRoles")
    .set({
      "product_admin": {        
          label: "Product Admin",
          isActive: true,
          sortOrder: 1,
        },
        "developer": {        
          label: "Developer",
          isActive: true,
          sortOrder: 2,
        },
        "admin_sales": {        
          label: "Admin Sales",
          isActive: true,
          sortOrder: 3,
        },
    });
    console.log("✓ FloPlugRoles seeded");
  process.exit(0);
};

seed().catch(console.error);