import { NextResponse } from 'next/server';

type RouteHandler = (req: Request, context?: any) => Promise<NextResponse>;

/**
 * Middleware to protect API routes with a simple API Key
 * Validates 'Authorization' header: "Bearer <API_KEY>"
 */
export function withAuth(handler: RouteHandler): RouteHandler {
    return async (req: Request, context?: any) => {
        // Skip auth for OPTIONS requests (CORS preflight)
        if (req.method === 'OPTIONS') {
            return handler(req, context);
        }

        const apiKeyHeader = req.headers.get('x-api-key');
        const authHeader = req.headers.get('Authorization');
        const envApiKey = process.env.API_KEY;

        if (!envApiKey) {
            console.error('API_KEY is not defined in environment variables');
            return NextResponse.json(
                { error: 'Server Configuration Error', message: 'API_KEY not set' },
                { status: 500 }
            );
        }

        let token: string | undefined;

        if (apiKeyHeader) {
            token = apiKeyHeader;
        } else if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        } else {
            return NextResponse.json(
                { error: 'Unauthorized', message: 'Missing API Key (x-api-key or Authorization header)' },
                { status: 401 }
            );
        }

        if (token !== envApiKey) {
            return NextResponse.json(
                { error: 'Unauthorized', message: 'Invalid API Key' },
                { status: 401 }
            );
        }

        // Auth successful, proceed to handler
        return handler(req, context);
    };
}
