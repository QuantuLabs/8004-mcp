/**
 * x402 Payment Protocol Integration Example
 *
 * This example demonstrates how to integrate ERC-8004 agent reputation
 * with the x402 payment protocol for proof-of-payment feedback.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';

async function main() {
  // Start the MCP server
  const server = spawn('npx', ['@quantulabs/8004-mcp'], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  const transport = new StdioClientTransport({
    reader: server.stdout!,
    writer: server.stdin!,
  });

  const client = new Client(
    { name: 'x402-example', version: '1.0.0' },
    { capabilities: {} }
  );

  await client.connect(transport);

  console.log('Connected to 8004-mcp');

  // ============================================
  // Server Side: Building Agent Identity
  // ============================================

  console.log('\n--- Server: Building Agent Identity ---');

  // When an agent receives a request, it announces its identity
  // in the 402 Payment Required response
  const identityResult = await client.callTool({
    name: 'x402_identity_build',
    arguments: {
      agentId: 'sol:HHCVWcqsziJMmp43u2UAgAfH2cBjUFxVdW1M3C3NqzvT',
    },
  });

  console.log('Agent Identity for PaymentRequired:');
  console.log(JSON.stringify(JSON.parse((identityResult.content as any)[0].text), null, 2));

  // The identity would be included in the 402 response:
  // {
  //   "paymentRequired": { ... standard x402 fields ... },
  //   "extensions": {
  //     "8004-reputation": {
  //       "agentRegistry": "solana:EtWTRA...:HHCVWc...",
  //       "agentId": "HHCVWcqs..."
  //     }
  //   }
  // }

  // ============================================
  // Client Side: Parsing Payment Response
  // ============================================

  console.log('\n--- Client: Parsing Payment Response ---');

  // After the client makes a payment, the facilitator returns a PaymentResponse
  // This example simulates a PaymentResponse from a Solana payment
  const mockPaymentResponse = {
    txHash: '5xR7mN2kQ8vP3tY6uW9aB4cD1eF2gH3iJ4kL5mN6oP7qR8sT9uV0wX1yZ2',
    from: 'ClientPubkey111111111111111111111111111111',
    to: 'HHCVWcqsziJMmp43u2UAgAfH2cBjUFxVdW1M3C3NqzvT',
    chainId: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1', // Solana devnet genesis
    success: true,
    settledAt: new Date().toISOString(),
  };

  // Encode as base64 (as x402 does)
  const encodedResponse = Buffer.from(JSON.stringify(mockPaymentResponse)).toString('base64');

  const proofResult = await client.callTool({
    name: 'x402_proof_parse',
    arguments: {
      paymentResponse: encodedResponse,
    },
  });

  console.log('Parsed Proof of Payment:');
  console.log(JSON.stringify(JSON.parse((proofResult.content as any)[0].text), null, 2));

  // ============================================
  // Client Side: Submitting Feedback with Proof
  // ============================================

  console.log('\n--- Client: Submitting Feedback with Proof ---');

  // Note: This will fail without a configured wallet and IPFS
  // In production, you would:
  // 1. Configure IPFS: await client.callTool({ name: 'ipfs_configure', arguments: { pinataJwt: '...' }})
  // 2. Create/unlock wallet: await client.callTool({ name: 'wallet_create', arguments: { ... }})

  // For demonstration, we use skipSend to get the unsigned transaction
  try {
    const feedbackResult = await client.callTool({
      name: 'x402_feedback_submit',
      arguments: {
        agentId: 'sol:HHCVWcqsziJMmp43u2UAgAfH2cBjUFxVdW1M3C3NqzvT',
        score: 85,
        tag1: 'x402-resource-delivered',
        tag2: 'exact-svm',
        endpoint: 'https://agent.example.com/mcp',
        comment: 'Excellent service, fast response',
        proofOfPayment: {
          fromAddress: 'ClientPubkey111111111111111111111111111111',
          toAddress: 'HHCVWcqsziJMmp43u2UAgAfH2cBjUFxVdW1M3C3NqzvT',
          chainId: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
          txHash: '5xR7mN2kQ8vP3tY6uW9aB4cD1eF2gH3iJ4kL5mN6oP7qR8sT9uV0wX1yZ2',
        },
        storeOnIpfs: false, // Disable for example (no IPFS configured)
        skipSend: true, // Return unsigned tx for example
        signer: 'ClientPubkey111111111111111111111111111111',
      },
    });

    console.log('Feedback Submission Result:');
    console.log(JSON.stringify(JSON.parse((feedbackResult.content as any)[0].text), null, 2));
  } catch (error) {
    console.log('Expected error (no wallet configured):', (error as Error).message);
  }

  // ============================================
  // Server Side: Submitting Counter-Feedback
  // ============================================

  console.log('\n--- Server: Submitting Counter-Feedback ---');

  // The server (agent) can also submit feedback about the client
  // This creates bidirectional reputation
  console.log('Server would submit feedback with:');
  console.log({
    clientId: 'Client agent ID if registered',
    score: 95,
    tag1: 'x402-good-payer',
    tag2: 'exact-svm',
    proofOfPayment: '... same proof ...',
  });

  // Cleanup
  await client.close();
  server.kill();

  console.log('\n--- Example Complete ---');
}

main().catch(console.error);
