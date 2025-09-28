import * as fs from 'fs';
import * as path from 'path';
const DATA_DIR = path.join(process.cwd(), 'data');
const USERS_DIR = path.join(DATA_DIR, 'users');
const DOCUMENTS_DIR = path.join(DATA_DIR, 'documents');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
export const ensureDirectories = () => {
    const dirs = [DATA_DIR, USERS_DIR, DOCUMENTS_DIR, BACKUPS_DIR];
    dirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });
};
export const saveUser = (user) => {
    const filePath = path.join(USERS_DIR, `${user.id}.json`);
    const userToSave = {
        ...user,
        updatedAt: new Date()
    };
    fs.writeFileSync(filePath, JSON.stringify(userToSave, null, 2));
};
export const loadUser = (userId) => {
    const filePath = path.join(USERS_DIR, `${userId}.json`);
    if (!fs.existsSync(filePath)) {
        return null;
    }
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        const user = JSON.parse(data);
        user.createdAt = new Date(user.createdAt);
        user.updatedAt = new Date(user.updatedAt);
        return user;
    }
    catch (error) {
        console.error(`Error loading user ${userId}:`, error);
        return null;
    }
};
export const loadAllUsers = () => {
    const users = [];
    if (!fs.existsSync(USERS_DIR)) {
        return users;
    }
    const files = fs.readdirSync(USERS_DIR);
    files.forEach(file => {
        if (file.endsWith('.json')) {
            const userId = file.replace('.json', '');
            const user = loadUser(userId);
            if (user) {
                users.push(user);
            }
        }
    });
    return users;
};
export const deleteUser = (userId) => {
    const filePath = path.join(USERS_DIR, `${userId}.json`);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
    }
    return false;
};
export const findUserByEmail = (email) => {
    const users = loadAllUsers();
    return users.find(user => user.email === email) || null;
};
export const saveDocument = (document) => {
    const filePath = path.join(DOCUMENTS_DIR, `${document.id}.json`);
    const documentToSave = {
        ...document,
        updatedAt: new Date()
    };
    fs.writeFileSync(filePath, JSON.stringify(documentToSave, null, 2));
};
export const loadDocument = (documentId) => {
    const filePath = path.join(DOCUMENTS_DIR, `${documentId}.json`);
    if (!fs.existsSync(filePath)) {
        return null;
    }
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        const document = JSON.parse(data);
        document.createdAt = new Date(document.createdAt);
        document.updatedAt = new Date(document.updatedAt);
        document.versions = document.versions?.map((version) => ({
            ...version,
            createdAt: new Date(version.createdAt)
        })) || [];
        return document;
    }
    catch (error) {
        console.error(`Error loading document ${documentId}:`, error);
        return null;
    }
};
export const loadAllDocuments = () => {
    const documents = [];
    if (!fs.existsSync(DOCUMENTS_DIR)) {
        return documents;
    }
    const files = fs.readdirSync(DOCUMENTS_DIR);
    files.forEach(file => {
        if (file.endsWith('.json')) {
            const documentId = file.replace('.json', '');
            const document = loadDocument(documentId);
            if (document) {
                documents.push(document);
            }
        }
    });
    return documents;
};
export const deleteDocument = (documentId) => {
    const filePath = path.join(DOCUMENTS_DIR, `${documentId}.json`);
    if (fs.existsSync(filePath)) {
        createBackup(documentId);
        fs.unlinkSync(filePath);
        return true;
    }
    return false;
};
export const findDocumentsByOwner = (ownerId) => {
    const documents = loadAllDocuments();
    return documents.filter(doc => doc.ownerId === ownerId);
};
export const findDocumentsByCollaborator = (collaboratorId) => {
    const documents = loadAllDocuments();
    return documents.filter(doc => doc.collaborators?.includes(collaboratorId));
};
export const createBackup = (documentId) => {
    const document = loadDocument(documentId);
    if (!document)
        return;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFilePath = path.join(BACKUPS_DIR, `${documentId}_${timestamp}.json`);
    const backupData = {
        document,
        backedUpAt: new Date(),
        type: 'auto_backup'
    };
    fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2));
};
export const listBackups = () => {
    const backups = [];
    if (!fs.existsSync(BACKUPS_DIR)) {
        return backups;
    }
    const files = fs.readdirSync(BACKUPS_DIR);
    files.forEach(file => {
        if (file.endsWith('.json') && file.includes('_')) {
            const filePath = path.join(BACKUPS_DIR, file);
            const stats = fs.statSync(filePath);
            const [documentId, timestampStr] = file.replace('.json', '').split('_');
            try {
                const timestamp = new Date(timestampStr.replace(/-/g, ':').replace('T', ' '));
                backups.push({
                    filename: file,
                    documentId,
                    timestamp,
                    size: stats.size
                });
            }
            catch (error) {
            }
        }
    });
    return backups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
};
export const restoreFromBackup = (filename) => {
    const backupFilePath = path.join(BACKUPS_DIR, filename);
    if (!fs.existsSync(backupFilePath)) {
        return false;
    }
    try {
        const backupData = JSON.parse(fs.readFileSync(backupFilePath, 'utf8'));
        const document = backupData.document;
        saveDocument(document);
        return true;
    }
    catch (error) {
        console.error(`Error restoring from backup ${filename}:`, error);
        return false;
    }
};
export const getStorageStats = () => {
    const stats = {
        users: 0,
        documents: 0,
        backups: 0,
        totalSize: 0
    };
    if (fs.existsSync(USERS_DIR)) {
        stats.users = fs.readdirSync(USERS_DIR).filter(f => f.endsWith('.json')).length;
    }
    if (fs.existsSync(DOCUMENTS_DIR)) {
        stats.documents = fs.readdirSync(DOCUMENTS_DIR).filter(f => f.endsWith('.json')).length;
    }
    if (fs.existsSync(BACKUPS_DIR)) {
        const backupFiles = fs.readdirSync(BACKUPS_DIR).filter(f => f.endsWith('.json'));
        stats.backups = backupFiles.length;
        backupFiles.forEach(file => {
            const filePath = path.join(BACKUPS_DIR, file);
            const fileStats = fs.statSync(filePath);
            stats.totalSize += fileStats.size;
        });
    }
    return stats;
};
export const cleanupOldBackups = (maxAge = 30) => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxAge);
    let deletedCount = 0;
    if (!fs.existsSync(BACKUPS_DIR)) {
        return deletedCount;
    }
    const files = fs.readdirSync(BACKUPS_DIR);
    files.forEach(file => {
        if (file.endsWith('.json') && file.includes('_')) {
            const filePath = path.join(BACKUPS_DIR, file);
            const stats = fs.statSync(filePath);
            if (stats.mtime < cutoffDate) {
                fs.unlinkSync(filePath);
                deletedCount++;
            }
        }
    });
    return deletedCount;
};
export const initializeStorage = () => {
    ensureDirectories();
    console.log('📁 File storage initialized');
    console.log(`📂 Users directory: ${USERS_DIR}`);
    console.log(`📂 Documents directory: ${DOCUMENTS_DIR}`);
    console.log(`📂 Backups directory: ${BACKUPS_DIR}`);
    const stats = getStorageStats();
    console.log(`📊 Storage stats:`, stats);
};
