#!/usr/bin/env bash
set -e

ENDPOINT=${DYNAMODB_ENDPOINT:-http://localhost:8000}
REGION=${AWS_REGION:-us-east-1}

echo "Creating DynamoDB tables (endpoint: $ENDPOINT)"

# Conversations table (with GSI to query by user_id)
aws dynamodb create-table \
  --endpoint-url "$ENDPOINT" --region "$REGION" \
  --table-name Conversations \
  --attribute-definitions AttributeName=id,AttributeType=S AttributeName=user_id,AttributeType=S AttributeName=updated_at,AttributeType=N \
  --key-schema AttributeName=id,KeyType=HASH \
  --global-secondary-indexes '[
    {"IndexName":"ConversationsByUser","KeySchema":[{"AttributeName":"user_id","KeyType":"HASH"},{"AttributeName":"updated_at","KeyType":"RANGE"}],
     "Projection":{"ProjectionType":"ALL"}}
  ]' \
  --billing-mode PAY_PER_REQUEST

# Messages (partitioned by conversation id, sorted by createdAt)
aws dynamodb create-table \
  --endpoint-url "$ENDPOINT" --region "$REGION" \
  --table-name Messages \
  --attribute-definitions AttributeName=conversationId,AttributeType=S AttributeName=createdAt,AttributeType=N \
  --key-schema AttributeName=conversationId,KeyType=HASH AttributeName=createdAt,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST

# Users table (with GSI on name for lookups by username)
aws dynamodb create-table \
  --endpoint-url "$ENDPOINT" --region "$REGION" \
  --table-name Users \
  --attribute-definitions AttributeName=id,AttributeType=S AttributeName=name,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --global-secondary-indexes '[
    {"IndexName":"UsersByName","KeySchema":[{"AttributeName":"name","KeyType":"HASH"}],"Projection":{"ProjectionType":"ALL"}}
  ]' \
  --billing-mode PAY_PER_REQUEST

# Moods table
aws dynamodb create-table \
  --endpoint-url "$ENDPOINT" --region "$REGION" \
  --table-name Moods \
  --attribute-definitions AttributeName=userId,AttributeType=S AttributeName=timestamp,AttributeType=N \
  --key-schema AttributeName=userId,KeyType=HASH AttributeName=timestamp,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST

  # add this to your create_tables.sh (modify names/casing to match your app)
aws dynamodb create-table \
  --endpoint-url "$ENDPOINT" --region "$REGION" \
  --table-name WellnessTips \
  --attribute-definitions AttributeName=id,AttributeType=S AttributeName=category,AttributeType=S AttributeName=created_at,AttributeType=N \
  --key-schema AttributeName=id,KeyType=HASH \
  --global-secondary-indexes '[
    {"IndexName":"TipsByCategory","KeySchema":[{"AttributeName":"category","KeyType":"HASH"},{"AttributeName":"created_at","KeyType":"RANGE"}],
     "Projection":{"ProjectionType":"ALL"}}
  ]' \
  --billing-mode PAY_PER_REQUEST


echo "Tables created."
