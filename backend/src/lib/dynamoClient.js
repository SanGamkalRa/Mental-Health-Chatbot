// src/lib/dynamoClient.js
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");

const REGION = process.env.AWS_REGION || "us-east-1";

// accept either name for compatibility
const endpoint = process.env.DYNAMODB_ENDPOINT || process.env.DYNAMO_ENDPOINT || "http://localhost:8000";

console.log(`[dynamoClient] REGION=${REGION} endpoint=${endpoint}`);

const options = {
  region: REGION,
  // when using local Dynamo, endpoint should be provided
  endpoint,
  // Provide dummy credentials for local dev (Dynamo local accepts any creds)
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "local",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "local",
  },
};

// If in actual AWS environment you don't want to pass a custom endpoint, unset the env var.
// The SDK will still work when endpoint === undefined, but for clarity we provided a default
// to local dev so you don't accidentally talk to AWS.
const client = new DynamoDBClient(options);
const ddbDocClient = DynamoDBDocumentClient.from(client);

module.exports = { ddbDocClient, client };
