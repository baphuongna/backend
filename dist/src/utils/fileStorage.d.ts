export interface StoredUser {
    id: string;
    email: string;
    name: string;
    avatar?: string;
    password: string;
    createdAt: Date;
    updatedAt: Date;
}
export interface StoredDocument {
    id: string;
    title: string;
    content: string;
    ownerId: string;
    collaborators: string[];
    createdAt: Date;
    updatedAt: Date;
    versions: StoredDocumentVersion[];
}
export interface StoredDocumentVersion {
    id: string;
    content: string;
    createdAt: Date;
    authorId: string;
    authorName: string;
    changeDescription?: string;
}
export declare const ensureDirectories: () => void;
export declare const saveUser: (user: StoredUser) => void;
export declare const loadUser: (userId: string) => StoredUser | null;
export declare const loadAllUsers: () => StoredUser[];
export declare const deleteUser: (userId: string) => boolean;
export declare const findUserByEmail: (email: string) => StoredUser | null;
export declare const saveDocument: (document: StoredDocument) => void;
export declare const loadDocument: (documentId: string) => StoredDocument | null;
export declare const loadAllDocuments: () => StoredDocument[];
export declare const deleteDocument: (documentId: string) => boolean;
export declare const findDocumentsByOwner: (ownerId: string) => StoredDocument[];
export declare const findDocumentsByCollaborator: (collaboratorId: string) => StoredDocument[];
export declare const createBackup: (documentId: string) => void;
export declare const listBackups: () => Array<{
    filename: string;
    documentId: string;
    timestamp: Date;
    size: number;
}>;
export declare const restoreFromBackup: (filename: string) => boolean;
export declare const getStorageStats: () => {
    users: number;
    documents: number;
    backups: number;
    totalSize: number;
};
export declare const cleanupOldBackups: (maxAge?: number) => number;
export declare const initializeStorage: () => void;
//# sourceMappingURL=fileStorage.d.ts.map