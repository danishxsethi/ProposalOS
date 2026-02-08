import '@testing-library/jest-dom';
import { beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { HttpResponse, http } from 'msw';

// Mock Server for API calls
export const server = setupServer(
    http.get('*/api/test', () => {
        return HttpResponse.json({ message: 'Hello World' });
    })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Mock Next.js Navigation
// vi.mock('next/navigation', () => ({
//     useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
//     useParams: () => ({}),
//     usePathname: () => '/',
// }));
