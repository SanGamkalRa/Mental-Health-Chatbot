// src/lib/dynamoClient.js
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");

const REGION = process.env.AWS_REGION || "us-east-1";

// Only use endpoint if explicitly provided in env (do NOT default to localhost here)
const endpointEnv = process.env.DYNAMODB_ENDPOINT || process.env.DYNAMO_ENDPOINT || undefined;

// Provide credentials if explicitly set in env — otherwise rely on standard AWS credential resolution
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

console.log(`[dynamoClient] REGION=${REGION} endpoint=${endpointEnv ? endpointEnv : "<none>"} usingEnvCreds=${!!(accessKeyId && secretAccessKey)}`);

const clientOptions = { region: REGION };

// add endpoint only if provided (local dev)
if (endpointEnv) {
  clientOptions.endpoint = endpointEnv;
}

// if credentials provided (e.g., for local or for simple testing), add them.
// In production prefer IAM roles / AWS CLI profile / environment from EC2/ECS/EKS.
if (accessKeyId && secretAccessKey) {
  clientOptions.credentials = {
    accessKeyId,
    secretAccessKey,
  };
}

// create client and document client
const client = new DynamoDBClient(clientOptions);
const ddbDocClient = DynamoDBDocumentClient.from(client);

module.exports = { ddbDocClient, client };
