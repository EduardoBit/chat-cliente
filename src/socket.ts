// src/socket.ts
import { io } from 'socket.io-client';

// La URL de tu servidor backend
const URL = 'http://localhost:4000';

export const socket = io(URL);