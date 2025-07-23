// test-node.js
const { spawn } = require('child_process');
const path = require('path');

async function testNode() {
  console.log('🧪 Testing MCB Node...');
  
  // Build the project first
  console.log('📦 Building project...');
  const build = spawn('pnpm', ['build'], { stdio: 'inherit' });
  
  build.on('close', (code) => {
    if (code === 0) {
      console.log('✅ Build successful!');
      
      // Initialize node
      console.log('🏗️  Initializing node...');
      const init = spawn('node', ['apps/node/dist/index.js', 'init', '--data-dir', './test-data'], { stdio: 'inherit' });
      
      init.on('close', (initCode) => {
        if (initCode === 0) {
          console.log('✅ Node initialized!');
          
          // Start node
          console.log('🚀 Starting node...');
          const node = spawn('node', ['apps/node/dist/index.js', 'start', '--data-dir', './test-data', '--port', '8545'], { stdio: 'inherit' });
          
          // Let it run for a few seconds then test RPC
          setTimeout(() => {
            testRPC();
          }, 3000);
          
          // Stop after 10 seconds
          setTimeout(() => {
            console.log('🛑 Stopping node...');
            node.kill('SIGINT');
          }, 10000);
          
        } else {
          console.error('❌ Node initialization failed');
        }
      });
    } else {
      console.error('❌ Build failed');
    }
  });
}

async function testRPC() {
  console.log('🔍 Testing RPC endpoints...');
  
  const tests = [
    {
      method: 'eth_blockNumber',
      params: []
    },
    {
      method: 'eth_chainId',
      params: []
    },
    {
      method: 'mcb_getNetworkInfo',
      params: []
    },
    {
      method: 'web3_clientVersion',
      params: []
    }
  ];

  for (const test of tests) {
    try {
      const response = await fetch('http://localhost:8545', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: test.method,
          params: test.params,
          id: 1
        })
      });

      const result = await response.json();
      console.log(`✅ ${test.method}:`, result.result);
    } catch (error) {
      console.log(`❌ ${test.method}:`, error.message);
    }
  }
}

testNode();