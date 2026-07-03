import { GET } from './route';
import { NextRequest } from 'next/server';

const requireAdminMock = jest.fn();
const selectResultQueue: any[] = [];

jest.mock('@/lib/auth/requireAdmin', () => ({
    requireAdmin: () => requireAdminMock(),
}));

jest.mock('@/lib/auth/membership-guard', () => ({
    parseOptionalClassroomId: (val: any) => val && val !== 'all' ? parseInt(val) : null,
    requireAuth: () => Promise.resolve({ email: 'user@example.com' }),
    requireTeacher: () => Promise.resolve({ role: 'teacher' }),
}));

jest.mock('@/configs/db', () => ({
    db: {
        select: jest.fn().mockImplementation(() => ({
            from: jest.fn().mockImplementation(() => ({
                where: jest.fn().mockImplementation(() => {
                    const data = selectResultQueue.shift() ?? [];
                    return Promise.resolve(data);
                }),
            })),
        })),
    },
}));

describe('Teacher Analytics API Endpoint', () => {
    beforeEach(() => {
        requireAdminMock.mockReset();
        selectResultQueue.length = 0;
        jest.clearAllMocks();
    });

    it('requires admin verification for the all-classrooms query', async () => {
        // Mock requireAdmin to throw NEXT_REDIRECT
        requireAdminMock.mockRejectedValue(new Error('NEXT_REDIRECT'));

        // Mock usersTable query (dbUser is a teacher, but trying to query "all" classrooms)
        selectResultQueue.push(
            [{ id: 1, email: 'user@example.com', role: 'teacher' }], // usersTable query
            [], // classroomsTaught query
            []  // teacherMemberships query
        );

        const req = new NextRequest('http://localhost/api/teacher/analytics?classroomId=all');

        await expect(GET(req)).rejects.toThrow('NEXT_REDIRECT');
    });

    it('allows a teacher to query analytics for a specific classroom without requireAdmin', async () => {
        // Mock usersTable query
        selectResultQueue.push(
            [{ id: 1, email: 'user@example.com', role: 'teacher' }], // usersTable query
            [], // classroomsTaught query
            []  // teacherMemberships query
        );

        const req = new NextRequest('http://localhost/api/teacher/analytics?classroomId=1');

        const res = await GET(req);
        const json = await res?.json();

        expect(res?.status).toBe(200);
        expect(requireAdminMock).not.toHaveBeenCalled();
    });
});
