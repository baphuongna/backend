import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import * as Y from 'yjs';
import * as fs from 'fs';
import multer from 'multer';
import { initializeStorage, saveUser, loadAllUsers, findUserByEmail, saveDocument, loadDocument, loadAllDocuments, deleteDocument, findDocumentsByOwner, findDocumentsByCollaborator, createBackup, getStorageStats } from './src/utils/fileStorage.js';
const usersCache = new Map();
const documentsCache = new Map();
const rooms = new Map();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const upload = multer({
    dest: 'uploads/',
    limits: {
        fileSize: 10 * 1024 * 1024
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/html' ||
            file.originalname.toLowerCase().endsWith('.html') ||
            file.originalname.toLowerCase().endsWith('.htm')) {
            cb(null, true);
        }
        else {
            cb(new Error('Only HTML files are allowed'));
        }
    }
});
const sanitizeHTML = (html) => {
    let sanitized = html;
    sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    sanitized = sanitized.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
    sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
    sanitized = sanitized.replace(/javascript:[^"']*/gi, '');
    sanitized = sanitized.replace(/<meta[^>]*http-equiv[^>]*>/gi, '');
    sanitized = sanitized.replace(/data:\s*text\/html[^,]*,/gi, '');
    return sanitized;
};
const extractTitle = (html) => {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return titleMatch ? titleMatch[1].trim() : 'Untitled Document';
};
const cleanHTMLForEditor = (html) => {
    let cleaned = html;
    cleaned = cleaned.replace(/<\/?(html|head|body)[^>]*>/gi, '');
    cleaned = cleaned.replace(/<(meta|title|link|base|style)[^>]*>.*?<\/\1>/gi, '');
    cleaned = cleaned.replace(/<(meta|link|base)[^>]*>/gi, '');
    cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');
    return cleaned.trim();
};
const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.NODE_ENV === 'production' ? false : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:5176', 'http://localhost:5177', 'http://localhost:5178', 'http://localhost:5179'],
        methods: ['GET', 'POST']
    }
});
app.use(cors());
app.use(express.json());
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }
        req.user = user;
        next();
    });
};
const generateToken = (user) => {
    return jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '24h' });
};
const createDocumentVersion = (document, content, authorId, authorName, changeDescription) => {
    return {
        id: uuidv4(),
        content,
        createdAt: new Date(),
        authorId,
        authorName,
        changeDescription
    };
};
const addDocumentVersion = (document, version, maxVersions = 50) => {
    if (!document.versions) {
        document.versions = [];
    }
    document.versions.push(version);
    document.versions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    if (document.versions.length > maxVersions) {
        document.versions = document.versions.slice(0, maxVersions);
    }
    document.updatedAt = new Date();
};
const createAutoSnapshot = (document, authorId, authorName) => {
    const now = new Date();
    const lastSnapshot = document.versions?.find(v => v.changeDescription?.includes('Auto-snapshot') &&
        v.authorId === authorId);
    const shouldCreateSnapshot = !lastSnapshot ||
        (now.getTime() - lastSnapshot.createdAt.getTime() > 30 * 60 * 1000);
    if (shouldCreateSnapshot) {
        const snapshotVersion = createDocumentVersion(document, document.content, authorId, authorName, 'Auto-snapshot');
        addDocumentVersion(document, snapshotVersion);
        console.log(`Auto-snapshot created for document ${document.id} by ${authorName}`);
    }
};
const getDocumentWithCache = (documentId) => {
    if (documentsCache.has(documentId)) {
        return documentsCache.get(documentId);
    }
    const document = loadDocument(documentId);
    if (document) {
        documentsCache.set(documentId, document);
    }
    return document;
};
const saveDocumentWithCache = (document) => {
    saveDocument(document);
    documentsCache.set(document.id, document);
};
const deleteDocumentWithCache = (documentId) => {
    const success = deleteDocument(documentId);
    if (success) {
        documentsCache.delete(documentId);
        rooms.delete(documentId);
    }
    return success;
};
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, name } = req.body;
        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Email, password, and name are required' });
        }
        const existingUser = findUserByEmail(email);
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = {
            id: uuidv4(),
            email,
            name,
            password: hashedPassword,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        saveUser(user);
        usersCache.set(user.id, user);
        const token = generateToken(user);
        res.status(201).json({
            message: 'User created successfully',
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                avatar: user.avatar
            }
        });
    }
    catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        const user = findUserByEmail(email);
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        usersCache.set(user.id, user);
        const token = generateToken(user);
        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                avatar: user.avatar
            }
        });
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.get('/api/documents', authenticateToken, (req, res) => {
    try {
        const user = req.user;
        const ownedDocuments = findDocumentsByOwner(user.id);
        const collaboratedDocuments = findDocumentsByCollaborator(user.id);
        const allUserDocuments = [...ownedDocuments, ...collaboratedDocuments];
        const uniqueDocuments = allUserDocuments.filter((doc, index, self) => index === self.findIndex(d => d.id === doc.id));
        const sortedDocuments = uniqueDocuments.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        sortedDocuments.forEach(doc => {
            documentsCache.set(doc.id, doc);
        });
        res.json(sortedDocuments);
    }
    catch (error) {
        console.error('Get documents error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.post('/api/documents', authenticateToken, (req, res) => {
    try {
        const user = req.user;
        const { title, content } = req.body;
        const document = {
            id: uuidv4(),
            title: title || 'Untitled Document',
            content: content || '<p>Start typing here...</p>',
            ownerId: user.id,
            collaborators: [],
            createdAt: new Date(),
            updatedAt: new Date(),
            versions: [{
                    id: uuidv4(),
                    content: content || '<p>Start typing here...</p>',
                    createdAt: new Date(),
                    authorId: user.id,
                    authorName: user.name,
                    changeDescription: 'Initial version'
                }]
        };
        saveDocument(document);
        documentsCache.set(document.id, document);
        const yDoc = new Y.Doc();
        rooms.set(document.id, {
            documentId: document.id,
            users: new Map(),
            yDoc
        });
        res.status(201).json(document);
    }
    catch (error) {
        console.error('Create document error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.get('/api/documents/:id', authenticateToken, (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;
        const document = documentsCache.get(id);
        if (!document) {
            return res.status(404).json({ error: 'Document not found' });
        }
        if (document.ownerId !== user.id && !document.collaborators.includes(user.id)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        res.json(document);
    }
    catch (error) {
        console.error('Get document error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.put('/api/documents/:id', authenticateToken, (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;
        const { title, content } = req.body;
        const document = loadDocument(id);
        if (!document) {
            return res.status(404).json({ error: 'Document not found' });
        }
        if (document.ownerId !== user.id && !document.collaborators.includes(user.id)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        if (content && content !== document.content) {
            document.versions.push({
                id: uuidv4(),
                content,
                createdAt: new Date(),
                authorId: user.id,
                authorName: user.name,
                changeDescription: 'Content updated'
            });
        }
        document.title = title || document.title;
        document.content = content || document.content;
        document.updatedAt = new Date();
        saveDocument(document);
        documentsCache.set(id, document);
        res.json(document);
    }
    catch (error) {
        console.error('Update document error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.delete('/api/documents/:id', authenticateToken, (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;
        const document = loadDocument(id);
        if (!document) {
            return res.status(404).json({ error: 'Document not found' });
        }
        if (document.ownerId !== user.id) {
            return res.status(403).json({ error: 'Access denied - only owner can delete document' });
        }
        const deleted = deleteDocument(id);
        if (deleted) {
            console.log(`🗑️ Document file deleted: ${id}`);
        }
        else {
            console.warn(`⚠️ Document file not found: ${id}`);
        }
        documentsCache.delete(id);
        res.json({ success: true, message: 'Document deleted successfully' });
    }
    catch (error) {
        console.error('Delete document error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.post('/api/documents/:id/collaborators', authenticateToken, (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;
        const { email } = req.body;
        const document = loadDocument(id);
        if (!document) {
            return res.status(404).json({ error: 'Document not found' });
        }
        if (document.ownerId !== user.id) {
            return res.status(403).json({ error: 'Only document owner can add collaborators' });
        }
        const collaborator = Array.from(users.values()).find(u => u.email === email);
        if (!collaborator) {
            return res.status(404).json({ error: 'User not found' });
        }
        if (collaborator.id === document.ownerId) {
            return res.status(400).json({ error: 'Cannot add owner as collaborator' });
        }
        if (!document.collaborators.includes(collaborator.id)) {
            document.collaborators.push(collaborator.id);
            document.updatedAt = new Date();
            saveDocument(document);
            documentsCache.set(id, document);
        }
        res.json({ message: 'Collaborator added successfully' });
    }
    catch (error) {
        console.error('Add collaborator error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.delete('/api/documents/:id/collaborators/:collaboratorId', authenticateToken, (req, res) => {
    try {
        const { id, collaboratorId } = req.params;
        const user = req.user;
        const document = loadDocument(id);
        if (!document) {
            return res.status(404).json({ error: 'Document not found' });
        }
        if (document.ownerId !== user.id) {
            return res.status(403).json({ error: 'Only document owner can remove collaborators' });
        }
        const collaboratorIndex = document.collaborators.indexOf(collaboratorId);
        if (collaboratorIndex === -1) {
            return res.status(404).json({ error: 'Collaborator not found' });
        }
        document.collaborators.splice(collaboratorIndex, 1);
        document.updatedAt = new Date();
        saveDocument(document);
        documentsCache.set(id, document);
        res.json({ message: 'Collaborator removed successfully' });
    }
    catch (error) {
        console.error('Remove collaborator error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.get('/api/documents', authenticateToken, (req, res) => {
    try {
        const user = req.user;
        const allDocuments = loadAllDocuments();
        const userDocuments = allDocuments
            .filter(doc => doc.ownerId === user.id || doc.collaborators?.includes(user.id))
            .map(doc => ({
            id: doc.id,
            title: doc.title,
            content: doc.content,
            ownerId: doc.ownerId,
            collaborators: doc.collaborators,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt
        }));
        console.log(`📤 Sending ${userDocuments.length} documents to user ${user.email}`);
        res.json(userDocuments);
    }
    catch (error) {
        console.error('Get documents error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.get('/api/auth/users', authenticateToken, (req, res) => {
    try {
        const allUsers = loadAllUsers().map(user => ({
            id: user.id,
            name: user.name,
            email: user.email,
            avatar: user.avatar
        }));
        allUsers.forEach(user => {
            usersCache.set(user.id, user);
        });
        res.json(allUsers);
    }
    catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
        return next(new Error('Authentication error'));
    }
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return next(new Error('Authentication error'));
        }
        socket.data.user = decoded;
        next();
    });
});
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.data.user.name}`);
    socket.on('join-document', async (documentId) => {
        try {
            const document = loadDocument(documentId);
            if (!document) {
                socket.emit('error', 'Document not found');
                return;
            }
            const user = socket.data.user;
            if (document.ownerId !== user.id && !document.collaborators?.includes(user.id)) {
                socket.emit('error', 'Access denied');
                return;
            }
            socket.join(documentId);
            let room = rooms.get(documentId);
            if (!room) {
                const yDoc = new Y.Doc();
                room = {
                    documentId,
                    users: new Map(),
                    yDoc
                };
                rooms.set(documentId, room);
            }
            room.users.set(socket.id, {
                ...user,
                socketId: socket.id
            });
            socket.to(documentId).emit('user-joined', {
                user,
                users: Array.from(room.users.values())
            });
            socket.emit('room-users', Array.from(room.users.values()));
            console.log(`${user.name} joined document: ${documentId}`);
        }
        catch (error) {
            console.error('Join document error:', error);
            socket.emit('error', 'Failed to join document');
        }
    });
    socket.on('document-change', async (data) => {
        try {
            const { documentId, content } = data;
            const user = socket.data.user;
            const document = loadDocument(documentId);
            if (!document) {
                return;
            }
            if (content !== document.content) {
                const version = createDocumentVersion(document, content, user.id, user.name, 'Manual save');
                await addDocumentVersion(document, version);
                await createAutoSnapshot(document, user.id, user.name);
            }
            const updatedDocument = {
                ...document,
                content,
                updatedAt: new Date()
            };
            await saveDocument(updatedDocument);
            socket.to(documentId).emit('document-updated', {
                content,
                updatedBy: user.name,
                updatedAt: new Date()
            });
            console.log(`Document ${documentId} updated by ${user.name}, version created`);
        }
        catch (error) {
            console.error('Document change error:', error);
        }
    });
    socket.on('cursor-move', (data) => {
        try {
            const { documentId, position, selection } = data;
            const user = socket.data.user;
            socket.to(documentId).emit('cursor-updated', {
                userId: user.id,
                userName: user.name,
                position,
                selection
            });
        }
        catch (error) {
            console.error('Cursor move error:', error);
        }
    });
    socket.on('typing', (data) => {
        try {
            const { documentId, isTyping } = data;
            const user = socket.data.user;
            socket.to(documentId).emit('user-typing', {
                userId: user.id,
                userName: user.name,
                isTyping
            });
        }
        catch (error) {
            console.error('Typing indicator error:', error);
        }
    });
    socket.on('disconnect', () => {
        try {
            const user = socket.data.user;
            console.log(`User disconnected: ${user.name}`);
            for (const [documentId, room] of rooms.entries()) {
                if (room.users.has(socket.id)) {
                    room.users.delete(socket.id);
                    socket.to(documentId).emit('user-left', {
                        user,
                        users: Array.from(room.users.values())
                    });
                    if (room.users.size === 0) {
                        rooms.delete(documentId);
                    }
                }
            }
        }
        catch (error) {
            console.error('Disconnect error:', error);
        }
    });
});
app.get('/api/documents/:id/versions', (req, res) => {
    try {
        const { id } = req.params;
        const document = loadDocument(id);
        if (!document) {
            return res.status(404).json({ error: 'Document not found' });
        }
        const versions = document.versions || [];
        res.json({
            documentId: id,
            versions: versions.map(v => ({
                id: v.id,
                content: v.content,
                createdAt: v.createdAt,
                authorId: v.authorId,
                authorName: v.authorName,
                changeDescription: v.changeDescription,
                isAutoSnapshot: v.changeDescription?.includes('Auto snapshot')
            }))
        });
    }
    catch (error) {
        console.error('Get versions error:', error);
        res.status(500).json({ error: 'Failed to get document versions' });
    }
});
app.get('/api/documents/:id/versions/:versionId', (req, res) => {
    try {
        const { id, versionId } = req.params;
        const document = loadDocument(id);
        if (!document) {
            return res.status(404).json({ error: 'Document not found' });
        }
        const version = document.versions?.find(v => v.id === versionId);
        if (!version) {
            return res.status(404).json({ error: 'Version not found' });
        }
        res.json({
            id: version.id,
            content: version.content,
            createdAt: version.createdAt,
            authorId: version.authorId,
            authorName: version.authorName,
            changeDescription: version.changeDescription,
            isAutoSnapshot: version.changeDescription?.includes('Auto snapshot')
        });
    }
    catch (error) {
        console.error('Get version error:', error);
        res.status(500).json({ error: 'Failed to get document version' });
    }
});
app.post('/api/documents/:id/versions', authenticateToken, (req, res) => {
    try {
        const { id } = req.params;
        const { changeDescription } = req.body;
        const document = loadDocument(id);
        if (!document) {
            return res.status(404).json({ error: 'Document not found' });
        }
        const version = createDocumentVersion(document, document.content, req.user.id, req.user.name, changeDescription || 'Manual save');
        addDocumentVersion(document, version);
        res.json({
            id: version.id,
            content: version.content,
            createdAt: version.createdAt,
            authorId: version.authorId,
            authorName: version.authorName,
            changeDescription: version.changeDescription
        });
    }
    catch (error) {
        console.error('Create version error:', error);
        res.status(500).json({ error: 'Failed to create document version' });
    }
});
app.post('/api/documents/:id/restore/:versionId', authenticateToken, (req, res) => {
    try {
        const { id, versionId } = req.params;
        const document = loadDocument(id);
        if (!document) {
            return res.status(404).json({ error: 'Document not found' });
        }
        if (document.ownerId !== req.user.id && !document.collaborators?.includes(req.user.id)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const version = document.versions?.find(v => v.id === versionId);
        if (!version) {
            return res.status(404).json({ error: 'Version not found' });
        }
        const currentVersion = createDocumentVersion(document, document.content, req.user.id, req.user.name, `Auto-save before restoring to version from ${version.createdAt.toLocaleString()}`);
        addDocumentVersion(document, currentVersion);
        document.content = version.content;
        document.updatedAt = new Date();
        saveDocument(document);
        documentsCache.set(id, document);
        io.to(`document:${id}`).emit('document-restored', {
            documentId: id,
            content: version.content,
            restoredBy: req.user.name,
            restoredAt: new Date(),
            fromVersion: {
                id: version.id,
                createdAt: version.createdAt,
                authorName: version.authorName
            }
        });
        res.json({
            message: 'Document restored successfully',
            restoredAt: new Date(),
            fromVersion: {
                id: version.id,
                createdAt: version.createdAt,
                authorName: version.authorName
            }
        });
    }
    catch (error) {
        console.error('Restore version error:', error);
        res.status(500).json({ error: 'Failed to restore document version' });
    }
});
app.get('/api/documents/:id/export/:format', authenticateToken, (req, res) => {
    try {
        const { id, format } = req.params;
        const document = loadDocument(id);
        if (!document) {
            return res.status(404).json({ error: 'Document not found' });
        }
        if (document.ownerId !== req.user.id && !document.collaborators?.includes(req.user.id)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        let content;
        let filename;
        let contentType;
        switch (format) {
            case 'html':
                content = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${document.title}</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        h1, h2, h3 { color: #333; }
        p { line-height: 1.6; }
        ul, ol { margin-left: 20px; }
        blockquote { border-left: 4px solid #ccc; margin-left: 0; padding-left: 20px; color: #666; }
    </style>
</head>
<body>
    ${document.content}
</body>
</html>`;
                filename = `${document.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.html`;
                contentType = 'text/html';
                break;
            case 'markdown':
                content = document.content
                    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
                    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
                    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
                    .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
                    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
                    .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
                    .replace(/<ul[^>]*>(.*?)<\/ul>/gis, (match, content) => {
                    return content.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n') + '\n';
                })
                    .replace(/<ol[^>]*>(.*?)<\/ol>/gis, (match, content) => {
                    let index = 1;
                    return content.replace(/<li[^>]*>(.*?)<\/li>/gi, () => `${index++}. $1\n`) + '\n';
                })
                    .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '> $1\n\n')
                    .replace(/<[^>]*>/g, '')
                    .replace(/&nbsp;/g, ' ')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&amp;/g, '&')
                    .replace(/\n{3,}/g, '\n\n')
                    .trim();
                filename = `${document.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
                contentType = 'text/markdown';
                break;
            case 'txt':
                content = document.content
                    .replace(/<[^>]*>/g, '')
                    .replace(/&nbsp;/g, ' ')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&amp;/g, '&')
                    .replace(/\n{3,}/g, '\n\n')
                    .trim();
                filename = `${document.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`;
                contentType = 'text/plain';
                break;
            default:
                return res.status(400).json({ error: 'Unsupported export format' });
        }
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(content);
    }
    catch (error) {
        console.error('Export document error:', error);
        res.status(500).json({ error: 'Failed to export document' });
    }
});
app.get('/api/storage/stats', authenticateToken, (req, res) => {
    try {
        const stats = getStorageStats();
        res.json(stats);
    }
    catch (error) {
        console.error('Get storage stats error:', error);
        res.status(500).json({ error: 'Failed to get storage stats' });
    }
});
app.post('/api/storage/backup/:documentId', authenticateToken, (req, res) => {
    try {
        const { documentId } = req.params;
        const user = req.user;
        const document = getDocumentWithCache(documentId);
        if (!document) {
            return res.status(404).json({ error: 'Document not found' });
        }
        if (document.ownerId !== user.id && !document.collaborators?.includes(user.id)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        createBackup(documentId);
        res.json({ message: 'Backup created successfully' });
    }
    catch (error) {
        console.error('Create backup error:', error);
        res.status(500).json({ error: 'Failed to create backup' });
    }
});
app.get('/api/storage/backups', authenticateToken, (req, res) => {
    try {
        const backups = listBackups();
        res.json(backups);
    }
    catch (error) {
        console.error('List backups error:', error);
        res.status(500).json({ error: 'Failed to list backups' });
    }
});
app.post('/api/storage/backups/cleanup', authenticateToken, (req, res) => {
    try {
        const { maxAge = 30 } = req.body;
        const deletedCount = cleanupOldBackups(maxAge);
        res.json({
            message: 'Cleanup completed',
            deletedBackups: deletedCount
        });
    }
    catch (error) {
        console.error('Cleanup backups error:', error);
        res.status(500).json({ error: 'Failed to cleanup backups' });
    }
});
app.post('/api/upload/html', authenticateToken, upload.single('htmlFile'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        const user = req.user;
        const filePath = req.file.path;
        const fileContent = fs.readFileSync(filePath, 'utf8');
        fs.unlinkSync(filePath);
        const sanitizedHTML = sanitizeHTML(fileContent);
        const cleanedHTML = cleanHTMLForEditor(sanitizedHTML);
        const title = extractTitle(fileContent);
        res.json({
            content: cleanedHTML,
            title: title,
            fileName: req.file.originalname,
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
            sanitized: true,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('HTML upload error:', error);
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        if (error instanceof multer.MulterError) {
            if (error.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
            }
            return res.status(400).json({ error: 'File upload error: ' + error.message });
        }
        res.status(500).json({ error: 'Failed to process HTML file' });
    }
});
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});
const createDefaultUser = () => {
    const existingUser = findUserByEmail('demo@example.com');
    if (existingUser) {
        console.log('Demo user already exists:', { email: existingUser.email });
        usersCache.set(existingUser.id, existingUser);
        return existingUser;
    }
    const defaultUser = {
        id: uuidv4(),
        email: 'demo@example.com',
        name: 'Demo User',
        password: bcrypt.hashSync('demo123', 10),
        createdAt: new Date(),
        updatedAt: new Date()
    };
    saveUser(defaultUser);
    usersCache.set(defaultUser.id, defaultUser);
    console.log('Default user created:', { email: defaultUser.email, password: 'demo123' });
    return defaultUser;
};
const createSampleDocument = () => {
    const allDocuments = loadAllDocuments();
    const existingSample = allDocuments.find(doc => doc.title === 'Welcome to Collaborative Editor');
    if (existingSample) {
        console.log('Sample document already exists');
        documentsCache.set(existingSample.id, existingSample);
        return existingSample;
    }
    const sampleDocument = {
        id: uuidv4(),
        title: 'Welcome to Collaborative Editor',
        content: `
<h1>Welcome to the HTML File Editor!</h1>
<p>This is a <strong>collaborative</strong> rich text editor built with:</p>
<ul>
  <li>Vue.js 3 + TypeScript</li>
  <li>Tiptap editor framework</li>
  <li>Socket.io for real-time collaboration</li>
  <li>Node.js + Express backend</li>
</ul>
<h2>Features</h2>
<ul>
  <li><strong>Real-time collaboration</strong> - Multiple users can edit simultaneously</li>
  <li><strong>User presence</strong> - See who else is in the document</li>
  <li><strong>Live cursors</strong> - See where other users are typing</li>
  <li><strong>Version history</strong> - Track changes over time</li>
  <li><strong>Export options</strong> - HTML, Markdown, Plain Text</li>
</ul>
<p><em>Start editing this document to see real-time collaboration in action!</em></p>
    `.trim(),
        ownerId: Array.from(usersCache.values())[0]?.id || '',
        collaborators: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        versions: []
    };
    saveDocument(sampleDocument);
    documentsCache.set(sampleDocument.id, sampleDocument);
    const yDoc = new Y.Doc();
    rooms.set(sampleDocument.id, {
        documentId: sampleDocument.id,
        users: new Map(),
        yDoc
    });
    console.log('Sample document created:', sampleDocument.title);
};
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 WebSocket server ready for real-time collaboration`);
    initializeStorage();
    const defaultUser = createDefaultUser();
    createSampleDocument();
    console.log('👤 Demo user: demo@example.com / demo123');
    console.log('📄 Sample document created for testing');
    const stats = getStorageStats();
    console.log('📊 Storage Statistics:', stats);
});
export default server;
