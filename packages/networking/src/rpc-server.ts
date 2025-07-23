import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { WebSocket, WebSocketServer } from 'ws';
import { logger } from '@mcb/shared';
import { RPCRequest, RPCResponse } from './types';

export interface RPCHandler {
  (params: any[]): Promise<any>;
}

export class RPCServer {
  private fastify: FastifyInstance;
  private wsServer: WebSocketServer;
  private handlers: Map<string, RPCHandler> = new Map();
  private subscriptions: Map<string, Set<WebSocket>> = new Map();

  constructor(private port: number) {
    this.fastify = Fastify({ logger: false });
    this.setupRoutes();
  }

  async start(): Promise<void> {
    // Start HTTP server
    await this.fastify.listen({ port: this.port, host: '0.0.0.0' });
    
    // Start WebSocket server
    this.wsServer = new WebSocketServer({ port: this.port + 1 });
    this.wsServer.on('connection', this.handleWebSocketConnection.bind(this));

    logger.info(`RPC server started on port ${this.port}`);
    logger.info(`WebSocket server started on port ${this.port + 1}`);
  }

  async stop(): Promise<void> {
    await this.fastify.close();
    this.wsServer.close();
    logger.info('RPC server stopped');
  }

  registerHandler(method: string, handler: RPCHandler): void {
    this.handlers.set(method, handler);
  }

  broadcast(event: string, data: any): void {
    const subscribers = this.subscriptions.get(event);
    if (subscribers) {
      const message = JSON.stringify({
        jsonrpc: '2.0',
        method: event,
        params: data
      });

      for (const ws of subscribers) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      }
    }
  }

  private setupRoutes(): void {
    // CORS headers
    this.fastify.addHook('preHandler', async (request, reply) => {
      reply.headers({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
    });

    // Handle preflight requests
    this.fastify.options('/*', async (request, reply) => {
      reply.status(200).send();
    });

    // Main RPC endpoint
    this.fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
      const rpcRequest = request.body as RPCRequest;
      const response = await this.handleRPCRequest(rpcRequest);
      reply.send(response);
    });

    // Health check
    this.fastify.get('/health', async (request, reply) => {
      reply.send({ status: 'ok', timestamp: Date.now() });
    });
  }

  private async handleRPCRequest(request: RPCRequest): Promise<RPCResponse> {
    try {
      const handler = this.handlers.get(request.method);
      
      if (!handler) {
        return {
          jsonrpc: '2.0',
          error: {
            code: -32601,
            message: 'Method not found'
          },
          id: request.id
        };
      }

      const result = await handler(request.params || []);
      
      return {
        jsonrpc: '2.0',
        result,
        id: request.id
      };
    } catch (error) {
      logger.error(`RPC error for method ${request.method}:`, error);
      
      return {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal error',
          data: error.message
        },
        id: request.id
      };
    }
  }

  private handleWebSocketConnection(ws: WebSocket): void {
    logger.info('New WebSocket connection');

    ws.on('message', (data: Buffer) => {
      try {
        const request = JSON.parse(data.toString()) as RPCRequest;
        
        // Handle subscriptions
        if (request.method === 'subscribe') {
          const event = request.params[0];
          if (!this.subscriptions.has(event)) {
            this.subscriptions.set(event, new Set());
          }
          this.subscriptions.get(event)!.add(ws);
          
          ws.send(JSON.stringify({
            jsonrpc: '2.0',
            result: true,
            id: request.id
          }));
        } else {
          // Handle regular RPC calls over WebSocket
          this.handleRPCRequest(request).then(response => {
            ws.send(JSON.stringify(response));
          });
        }
      } catch (error) {
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32700,
            message: 'Parse error'
          },
          id: null
        }));
      }
    });

    ws.on('close', () => {
      // Remove from all subscriptions
      for (const subscribers of this.subscriptions.values()) {
        subscribers.delete(ws);
      }
      logger.info('WebSocket connection closed');
    });
  }
}