import * as fs from 'fs'
import * as path from 'path'
import { v4 as uuidv4 } from 'uuid'

// Types
export interface StoredUser {
  id: string
  email: string
  name: string
  avatar?: string
  password: string
  createdAt: Date
  updatedAt: Date
}

export interface StoredDocument {
  id: string
  title: string
  content: string
  ownerId: string
  collaborators: string[]
  createdAt: Date
  updatedAt: Date
  versions: StoredDocumentVersion[]
}

export interface StoredDocumentVersion {
  id: string
  content: string
  createdAt: Date
  authorId: string
  authorName: string
  changeDescription?: string
}

// File storage paths
const DATA_DIR = path.join(process.cwd(), 'data')
const USERS_DIR = path.join(DATA_DIR, 'users')
const DOCUMENTS_DIR = path.join(DATA_DIR, 'documents')
const BACKUPS_DIR = path.join(DATA_DIR, 'backups')

// Ensure directories exist
export const ensureDirectories = () => {
  const dirs = [DATA_DIR, USERS_DIR, DOCUMENTS_DIR, BACKUPS_DIR]
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  })
}

// User storage functions
export const saveUser = (user: StoredUser): void => {
  const filePath = path.join(USERS_DIR, `${user.id}.json`)
  const userToSave = {
    ...user,
    updatedAt: new Date()
  }
  fs.writeFileSync(filePath, JSON.stringify(userToSave, null, 2))
}

export const loadUser = (userId: string): StoredUser | null => {
  const filePath = path.join(USERS_DIR, `${userId}.json`)
  if (!fs.existsSync(filePath)) {
    return null
  }

  try {
    const data = fs.readFileSync(filePath, 'utf8')
    const user = JSON.parse(data)
    // Convert date strings back to Date objects
    user.createdAt = new Date(user.createdAt)
    user.updatedAt = new Date(user.updatedAt)
    return user
  } catch (error) {
    console.error(`Error loading user ${userId}:`, error)
    return null
  }
}

export const loadAllUsers = (): StoredUser[] => {
  const users: StoredUser[] = []

  if (!fs.existsSync(USERS_DIR)) {
    return users
  }

  const files = fs.readdirSync(USERS_DIR)
  files.forEach(file => {
    if (file.endsWith('.json')) {
      const userId = file.replace('.json', '')
      const user = loadUser(userId)
      if (user) {
        users.push(user)
      }
    }
  })

  return users
}

export const deleteUser = (userId: string): boolean => {
  const filePath = path.join(USERS_DIR, `${userId}.json`)
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
    return true
  }
  return false
}

export const findUserByEmail = (email: string): StoredUser | null => {
  const users = loadAllUsers()
  return users.find(user => user.email === email) || null
}

// Document storage functions
export const saveDocument = (document: StoredDocument): void => {
  const filePath = path.join(DOCUMENTS_DIR, `${document.id}.json`)
  const documentToSave = {
    ...document,
    updatedAt: new Date()
  }
  fs.writeFileSync(filePath, JSON.stringify(documentToSave, null, 2))
}

export const loadDocument = (documentId: string): StoredDocument | null => {
  const filePath = path.join(DOCUMENTS_DIR, `${documentId}.json`)
  if (!fs.existsSync(filePath)) {
    return null
  }

  try {
    const data = fs.readFileSync(filePath, 'utf8')
    const document = JSON.parse(data)
    // Convert date strings back to Date objects
    document.createdAt = new Date(document.createdAt)
    document.updatedAt = new Date(document.updatedAt)
    document.versions = document.versions?.map((version: any) => ({
      ...version,
      createdAt: new Date(version.createdAt)
    })) || []
    return document
  } catch (error) {
    console.error(`Error loading document ${documentId}:`, error)
    return null
  }
}

export const loadAllDocuments = (): StoredDocument[] => {
  const documents: StoredDocument[] = []

  if (!fs.existsSync(DOCUMENTS_DIR)) {
    return documents
  }

  const files = fs.readdirSync(DOCUMENTS_DIR)
  files.forEach(file => {
    if (file.endsWith('.json')) {
      const documentId = file.replace('.json', '')
      const document = loadDocument(documentId)
      if (document) {
        documents.push(document)
      }
    }
  })

  return documents
}

export const deleteDocument = (documentId: string): boolean => {
  const filePath = path.join(DOCUMENTS_DIR, `${documentId}.json`)
  if (fs.existsSync(filePath)) {
    // Create backup before deletion
    createBackup(documentId)
    fs.unlinkSync(filePath)
    return true
  }
  return false
}

export const findDocumentsByOwner = (ownerId: string): StoredDocument[] => {
  const documents = loadAllDocuments()
  return documents.filter(doc => doc.ownerId === ownerId)
}

export const findDocumentsByCollaborator = (collaboratorId: string): StoredDocument[] => {
  const documents = loadAllDocuments()
  return documents.filter(doc => doc.collaborators?.includes(collaboratorId))
}

// Backup functions
export const createBackup = (documentId: string): void => {
  const document = loadDocument(documentId)
  if (!document) return

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupFilePath = path.join(BACKUPS_DIR, `${documentId}_${timestamp}.json`)

  const backupData = {
    document,
    backedUpAt: new Date(),
    type: 'auto_backup'
  }

  fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2))
}

export const listBackups = (): Array<{
  filename: string
  documentId: string
  timestamp: Date
  size: number
}> => {
  const backups: Array<{
    filename: string
    documentId: string
    timestamp: Date
    size: number
  }> = []

  if (!fs.existsSync(BACKUPS_DIR)) {
    return backups
  }

  const files = fs.readdirSync(BACKUPS_DIR)
  files.forEach(file => {
    if (file.endsWith('.json') && file.includes('_')) {
      const filePath = path.join(BACKUPS_DIR, file)
      const stats = fs.statSync(filePath)
      const [documentId, timestampStr] = file.replace('.json', '').split('_')

      try {
        const timestamp = new Date(timestampStr.replace(/-/g, ':').replace('T', ' '))
        backups.push({
          filename: file,
          documentId,
          timestamp,
          size: stats.size
        })
      } catch (error) {
        // Skip invalid backup files
      }
    }
  })

  return backups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
}

export const restoreFromBackup = (filename: string): boolean => {
  const backupFilePath = path.join(BACKUPS_DIR, filename)
  if (!fs.existsSync(backupFilePath)) {
    return false
  }

  try {
    const backupData = JSON.parse(fs.readFileSync(backupFilePath, 'utf8'))
    const document = backupData.document

    // Restore the document
    saveDocument(document)
    return true
  } catch (error) {
    console.error(`Error restoring from backup ${filename}:`, error)
    return false
  }
}

// Utility functions
export const getStorageStats = () => {
  const stats = {
    users: 0,
    documents: 0,
    backups: 0,
    totalSize: 0
  }

  // Count users
  if (fs.existsSync(USERS_DIR)) {
    stats.users = fs.readdirSync(USERS_DIR).filter(f => f.endsWith('.json')).length
  }

  // Count documents
  if (fs.existsSync(DOCUMENTS_DIR)) {
    stats.documents = fs.readdirSync(DOCUMENTS_DIR).filter(f => f.endsWith('.json')).length
  }

  // Count backups and calculate total size
  if (fs.existsSync(BACKUPS_DIR)) {
    const backupFiles = fs.readdirSync(BACKUPS_DIR).filter(f => f.endsWith('.json'))
    stats.backups = backupFiles.length

    backupFiles.forEach(file => {
      const filePath = path.join(BACKUPS_DIR, file)
      const fileStats = fs.statSync(filePath)
      stats.totalSize += fileStats.size
    })
  }

  return stats
}

export const cleanupOldBackups = (maxAge: number = 30): number => {
  // Delete backups older than maxAge days
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - maxAge)

  let deletedCount = 0

  if (!fs.existsSync(BACKUPS_DIR)) {
    return deletedCount
  }

  const files = fs.readdirSync(BACKUPS_DIR)
  files.forEach(file => {
    if (file.endsWith('.json') && file.includes('_')) {
      const filePath = path.join(BACKUPS_DIR, file)
      const stats = fs.statSync(filePath)

      if (stats.mtime < cutoffDate) {
        fs.unlinkSync(filePath)
        deletedCount++
      }
    }
  })

  return deletedCount
}

// Initialize file storage
export const initializeStorage = () => {
  ensureDirectories()
  console.log('📁 File storage initialized')
  console.log(`📂 Users directory: ${USERS_DIR}`)
  console.log(`📂 Documents directory: ${DOCUMENTS_DIR}`)
  console.log(`📂 Backups directory: ${BACKUPS_DIR}`)

  const stats = getStorageStats()
  console.log(`📊 Storage stats:`, stats)
}