import fs from "fs";
import path from "path";
import swaggerAutogen from "swagger-autogen";
import { fileURLToPath } from "url";
import YAML from "yamljs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load the existing openapi.yaml to reuse schemas and components
const openapiPath = path.join(__dirname, "../openapi.yaml");
let existingSpec = {};
if (fs.existsSync(openapiPath)) {
  try {
    existingSpec = YAML.load(openapiPath);
  } catch (e) {
    console.error("Warning: Could not load existing openapi.yaml:", e.message);
  }
}

const doc = {
  openapi: "3.0.0",
  info: {
    title: "TaskGid API",
    description:
      "Auto-generated API documentation for TaskGid - Task Management Application",
    version: "1.0.0",
  },
  servers: [
    {
      url: process.env.FRONTEND_URL || "http://localhost:3001",
      description: "Current Environment",
    },
  ],
  components: existingSpec.components || {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
  },
};

const outputFile = path.join(__dirname, "../swagger-output.json");
const endpointsFiles = [path.join(__dirname, "../src/index.js")];

const options = {
  openapi: "3.0.0",
  autoBody: true,
  autoQuery: true,
  autoHeaders: true,
};

console.log("Generating Swagger documentation...");

swaggerAutogen(options)(outputFile, endpointsFiles, doc).then(() => {
  console.log(
    "Swagger documentation generated successfully: swagger-output.json",
  );
});
