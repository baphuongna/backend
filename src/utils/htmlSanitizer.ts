import DOMPurify from 'dompurify'

// Các HTML tags được cho phép để tránh XSS attacks
export const ALLOWED_HTML_TAGS = [
  // Text formatting
  'p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'em', 'i', 'b', 'u', 's', 'del', 'ins',
  'blockquote', 'pre', 'code', 'kbd', 'samp', 'var',
  'sub', 'sup', 'small', 'big',

  // Lists
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',

  // Links and images
  'a', 'img',

  // Tables
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'col', 'colgroup', 'caption',

  // Structure
  'div', 'span', 'hr',

  // Media (limited)
  'video', 'audio', 'source',

  // Forms (limited)
  'label', 'input', 'select', 'option', 'textarea'
]

// Các attributes được cho phép
export const ALLOWED_HTML_ATTRS = [
  // Universal attributes
  'class', 'id', 'style', 'title', 'lang', 'dir',

  // Link attributes
  'href', 'target', 'rel', 'download',

  // Image attributes
  'src', 'alt', 'width', 'height', 'loading',

  // Table attributes
  'colspan', 'rowspan', 'scope', 'headers',

  // Form attributes
  'type', 'name', 'value', 'placeholder', 'required',
  'disabled', 'readonly', 'checked', 'selected',
  'min', 'max', 'step', 'pattern',

  // Video/audio attributes
  'controls', 'autoplay', 'muted', 'loop', 'preload'
]

// Cấu hình DOMPurify cho HTML content
const sanitizeConfig = {
  ALLOWED_TAGS: ALLOWED_HTML_TAGS,
  ALLOWED_ATTR: ALLOWED_HTML_ATTRS,

  // Chặn các dangerous protocols
  ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,

  // Xóa các styles nguy hiểm
  ALLOW_DATA_ATTR: false,

  // Force HTTPS cho links
  FORCE_BODY: true,

  // Xóa comments để tránh injection
  ALLOW_COMMENTS: false,

  // Xóa các empty elements không cần thiết
  KEEP_CONTENT: true,

  // Add rel="noopener noreferrer" cho external links
  ADD_ATTR: ['target'],
  ADD_TAGS: [],
  FORBID_ATTR: ['style'], // Xóa inline styles để tránh CSS attacks

  // Custom sanitizer function
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],

  // Transform links to be safe
  SAFE_FOR_TEMPLATES: false,
  WHOLE_DOCUMENT: false,
  RETURN_DOM: false,
  RETURN_DOM_FRAGMENT: false,
  RETURN_TRUSTED_TYPE: false
}

// Sanitize HTML content
export const sanitizeHTML = (html: string): string => {
  try {
    // Clean HTML before sanitization
    let cleanedHTML = html

    // Remove potentially dangerous patterns
    cleanedHTML = cleanedHTML.replace(/javascript:[^"']*/gi, '')
    cleanedHTML = cleanedHTML.replace(/on\w+\s*=/gi, '') // Remove event handlers
    cleanedHTML = cleanedHTML.replace(/data:\w+\/[^;]+;base64,[\w+/=]+/gi, '') // Remove data URIs

    // Sanitize with DOMPurify
    const sanitized = DOMPurify.sanitize(cleanedHTML, sanitizeConfig)

    return sanitized
  } catch (error) {
    console.error('Error sanitizing HTML:', error)
    return '' // Return empty string on error
  }
}

// Validate file type and size
export const validateHTMLFile = (file: File): { isValid: boolean; error?: string } => {
  // Check file extension first (more reliable than MIME type)
  const validExtensions = ['.html', '.htm']
  const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'))
  if (!validExtensions.includes(fileExtension)) {
    return { isValid: false, error: 'Định dạng file không hợp lệ. Chỉ chấp nhận .html và .htm' }
  }

  // Check file type (more lenient - accept HTML-like types or text types)
  const validMimeTypes = ['text/html', 'application/html', 'text/plain']
  if (file.type && !validMimeTypes.some(type => file.type.includes(type))) {
    return { isValid: false, error: 'Loại file không được hỗ trợ' }
  }

  // Check file size (max 10MB)
  const maxSize = 10 * 1024 * 1024 // 10MB
  if (file.size > maxSize) {
    return { isValid: false, error: 'File quá lớn. Kích thước tối đa: 10MB' }
  }

  // Check file name for security
  const fileName = file.name.toLowerCase()
  const suspiciousPatterns = [
    /\.\./, // Directory traversal
    /\//, // Path separator
    /\\/, // Windows path separator
    /^con$/i, // Reserved Windows filename
    /^prn$/i,
    /^aux$/i,
    /^nul$/i,
    /^com[1-9]$/i,
    /^lpt[1-9]$/i
  ]

  if (suspiciousPatterns.some(pattern => pattern.test(fileName))) {
    return { isValid: false, error: 'Tên file chứa ký tự không hợp lệ' }
  }

  return { isValid: true }
}

// Extract title from HTML
export const extractTitleFromHTML = (html: string): string => {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return titleMatch ? titleMatch[1].trim() : 'Untitled Document'
}

// Extract meta description from HTML
export const extractDescriptionFromHTML = (html: string): string => {
  const descMatch = html.match(/<meta[^>]*name=['"]description['"][^>]*content=['"]([^'"]+)['"][^>]*>/i)
  return descMatch ? descMatch[1].trim() : ''
}

// Clean HTML for better editor compatibility
export const cleanHTMLForEditor = (html: string): string => {
  let cleaned = html

  // Remove body, head, html tags
  cleaned = cleaned.replace(/<\/?(html|head|body)[^>]*>/gi, '')

  // Remove meta tags, title, link, base, style
  cleaned = cleaned.replace(/<(meta|title|link|base|style)[^>]*>.*?<\/\1>/gi, '')
  cleaned = cleaned.replace(/<(meta|link|base)[^>]*>/gi, '')

  // Remove script tags (đã được DOMPurify xử lý nhưng làm thêm để chắc chắn)
  cleaned = cleaned.replace(/<script[^>]*>.*?<\/script>/gi, '')
  cleaned = cleaned.replace(/<script[^>]*>/gi, '')

  // Remove comments
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '')

  // Remove extra whitespace
  cleaned = cleaned.replace(/\n\s*\n/g, '\n')
  cleaned = cleaned.trim()

  return cleaned
}

// Parse HTML file and return sanitized content
export const parseHTMLFile = async (file: File): Promise<{
  content: string
  title: string
  description: string
  error?: string
}> => {
  // Validate file
  const validation = validateHTMLFile(file)
  if (!validation.isValid) {
    return {
      content: '',
      title: '',
      description: '',
      error: validation.error
    }
  }

  try {
    // Read file content
    const htmlContent = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target?.result as string)
      reader.onerror = () => reject(new Error('Không thể đọc file'))
      reader.readAsText(file)
    })

    // Extract metadata
    const title = extractTitleFromHTML(htmlContent)
    const description = extractDescriptionFromHTML(htmlContent)

    // Clean and sanitize content
    const cleanedHTML = cleanHTMLForEditor(htmlContent)
    const sanitizedContent = sanitizeHTML(cleanedHTML)

    return {
      content: sanitizedContent,
      title,
      description,
      error: undefined
    }
  } catch (error) {
    return {
      content: '',
      title: '',
      description: '',
      error: 'Lỗi khi xử lý file HTML'
    }
  }
}

// Create safe download link for HTML files
export const createSafeLink = (href: string): string => {
  try {
    const url = new URL(href)

    // Only allow safe protocols
    const safeProtocols = ['http:', 'https:', 'mailto:', 'tel:', 'tel:']
    if (!safeProtocols.includes(url.protocol)) {
      return '#'
    }

    // Add security attributes
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return href
    }

    return href
  } catch {
    return '#'
  }
}

// Advanced HTML content validation
export const validateHTMLContent = (htmlContent: string): { isValid: boolean; error?: string; warnings?: string[] } => {
  const warnings: string[] = []

  try {
    // Check for basic HTML structure
    if (!htmlContent.includes('<') || !htmlContent.includes('>')) {
      return { isValid: false, error: 'File không có cấu trúc HTML hợp lệ' }
    }

    // Check for potentially dangerous content
    const dangerousPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /data:\s*text\/html/i,
      /<iframe/i,
      /<object/i,
      /<embed/i,
      /<link/i,
      /<meta\s+http-equiv=["']refresh["']/i
    ]

    const foundDangerous = dangerousPatterns.find(pattern => pattern.test(htmlContent))
    if (foundDangerous) {
      warnings.push('File chứa nội dung có khả năng gây hại, sẽ được tự động làm sạch')
    }

    // Check for extremely large files that might cause performance issues
    if (htmlContent.length > 5_000_000) { // 5MB of text
      warnings.push('File rất lớn, có thể ảnh hưởng đến hiệu suất xử lý')
    }

    // Check for excessive nested elements
    const openTagMatches = htmlContent.match(/<[^>]+>/g) || []
    if (openTagMatches.length > 10000) {
      warnings.push('File chứa quá nhiều thẻ HTML, có thể ảnh hưởng đến hiệu suất')
    }

    // Check for HTML structure
    const hasHtmlTag = /<html/i.test(htmlContent)
    const hasHeadTag = /<head/i.test(htmlContent)
    const hasBodyTag = /<body/i.test(htmlContent)

    if (hasHtmlTag && (!hasHeadTag || !hasBodyTag)) {
      warnings.push('Cấu trúc HTML không hoàn chỉnh, nhưng vẫn có thể xử lý được')
    }

    return {
      isValid: true,
      warnings: warnings.length > 0 ? warnings : undefined
    }
  } catch (error) {
    return {
      isValid: false,
      error: 'Lỗi khi phân tích nội dung HTML'
    }
  }
}

// Export utilities
export const HTMLUtils = {
  sanitizeHTML,
  validateHTMLFile,
  validateHTMLContent,
  extractTitleFromHTML,
  extractDescriptionFromHTML,
  cleanHTMLForEditor,
  parseHTMLFile,
  createSafeLink
}