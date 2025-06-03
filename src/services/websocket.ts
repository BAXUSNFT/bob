import { WebSocket, WebSocketServer } from 'ws';

export class WebsocketService {
    public wss: WebSocketServer | null = null;
    private static instance: WebsocketService | null = null;
    private clients: Map<string, WebSocket> = new Map();
    private isInitializing: boolean = false;

    private constructor() { }

    public static getInstance(): WebsocketService {
        if (!WebsocketService.instance) {
            WebsocketService.instance = new WebsocketService();
        }
        return WebsocketService.instance;
    }

    initialize(): void {
        if (this.wss) {
            console.log("WebSocket server is already initialized.");
            return;
        }

        if (this.isInitializing) {
            console.log("WebSocket server is currently initializing.");
            return;
        }

        this.isInitializing = true;

        try {
            let isProduction = process.env.NODE_ENV === 'production';
            const port = parseInt(process.env.WEBSOCKET_PORT || "8080");

            if (isProduction) {
                this.wss = new WebSocketServer({ port, host: '0.0.0.0' });
                console.log(`WebSocket server initialized ${this.wss?.address()}`);
            } else {
                this.wss = new WebSocketServer({ port });
            }

            console.log(`WebSocket server initialized on port ${port}`);

            this.wss.on('connection', (ws: WebSocket) => {
                console.log('New client connected');

                // Send a welcome message to the client
                ws.send(JSON.stringify({ type: "welcome", message: 'Welcome to Drunk Bob\'s Whiskey Bar!' }));

                // Handle messages from clients
                ws.on('message', async (message) => {
                    try {
                        console.log(`Received: ${message}`);
                        const data = JSON.parse(message.toString());

                        if (data.type === "register" && data.clientId) {
                            // Associate the received clientId with the WebSocket connection
                            this.clients.set(data.clientId, ws);
                            console.log(`Client registered with ID: ${data.clientId}`);

                            // Confirm registration to client
                            ws.send(JSON.stringify({
                                type: "registered",
                                clientId: data.clientId,
                                message: "Successfully registered with the whiskey recommender"
                            }));
                        } else if (data.type === "request_recommendation") {
                            // Handle recommendation requests (processed by your existing action)
                            console.log(`Received recommendation request:`, data);
                        } else {
                            console.log(`Received unknown message type:`, data);
                        }
                    } catch (error) {
                        console.error('Error processing WebSocket message:', error);
                        ws.send(JSON.stringify({
                            type: "error",
                            message: "Failed to process your message"
                        }));
                    }
                });

                // Handle client disconnection
                ws.on('close', () => {
                    console.log('Client disconnected');
                    // Remove client from our map when they disconnect
                    for (const [clientId, client] of this.clients.entries()) {
                        if (client === ws) {
                            this.clients.delete(clientId);
                            console.log(`Client with ID ${clientId} disconnected.`);
                            break;
                        }
                    }
                });
            });

            // Handle server errors
            this.wss.on('error', (error) => {
                console.error('WebSocket server error:', error);
            });

            console.log('WebSocket server is running');
        } catch (error) {
            console.error('Error initializing WebSocket server:', error);
            this.cleanup();
            throw error;
        } finally {
            this.isInitializing = false;
        }
    }

    cleanup(): void {
        if (this.wss) {
            try {
                // Close all client connections
                this.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.close();
                    }
                });
                this.clients.clear();

                // Close the server
                this.wss.close(() => {
                    console.log('WebSocket server closed');
                });
                this.wss = null;
            } catch (error) {
                console.error('Error during WebSocket cleanup:', error);
            }
        }
    }

    async sendMessage(data: any, clientId: string): Promise<void> {
        if (!this.wss) {
            throw new Error("WebSocket server is not initialized.");
        }

        console.log(`Sending message to client ${clientId}:`, data);

        const client = this.clients.get(clientId);
        if (client && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        } else {
            console.log(`Client with ID ${clientId} not found or not connected.`);
        }
    }

    async broadcastMessage(data: any): Promise<void> {
        if (!this.wss) {
            throw new Error("WebSocket server is not initialized.");
        }

        console.log('Broadcasting message to all clients:', data);

        this.wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(data));
            }
        });
    }
}