/*
 * OPTIONAL API REFERENCE
 *
 * Login:
 *
 * POST http://localhost:5000/api/auth/login
 * Body:
 * {
 *   "userId": "ADM001",
 *   "password": "password123"
 * }
 *
 * Expected response:
 * {
 *   "token": "jwt-token",
 *   "user": {
 *     "userId": "ADM001",
 *     "role": "admin",
 *     "email": "admin@example.com"
 *   }
 * }
 *
 * Signup:
 *
 * POST http://localhost:5000/api/auth/register
 * Body:
 * {
 *   "userId": "MEM001",
 *   "password": "password123",
 *   "email": "member@example.com",
 *   "mobile": "9876543210"
 * }
 *
 * Notice that signup does NOT contain `role`.
 * The administrator should assign the role later.
 */
