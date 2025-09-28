import DOMPurify from 'dompurify';
export const ALLOWED_HTML_TAGS = [
    'p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'em', 'i', 'b', 'u', 's', 'del', 'ins',
    'blockquote', 'pre', 'code', 'kbd', 'samp', 'var',
    'sub', 'sup', 'small', 'big',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'a', 'img',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    'col', 'colgroup', 'caption',
    'div', 'span', 'hr',
    'video', 'audio', 'source',
    'label', 'input', 'select', 'option', 'textarea'
];
export const ALLOWED_HTML_ATTRS = [
    'class', 'id', 'style', 'title', 'lang', 'dir',
    'href', 'target', 'rel', 'download',
    'src', 'alt', 'width', 'height', 'loading',
    'colspan', 'rowspan', 'scope', 'headers',
    'type', 'name', 'value', 'placeholder', 'required',
    'disabled', 'readonly', 'checked', 'selected',
    'min', 'max', 'step', 'pattern',
    'controls', 'autoplay', 'muted', 'loop', 'preload'
];
const sanitizeConfig = {
    ALLOWED_TAGS: ALLOWED_HTML_TAGS,
    ALLOWED_ATTR: ALLOWED_HTML_ATTRS,
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    ALLOW_DATA_ATTR: false,
    FORCE_BODY: true,
    ALLOW_COMMENTS: false,
    KEEP_CONTENT: true,
    ADD_ATTR: ['target'],
    ADD_TAGS: [],
    FORBID_ATTR: ['style'],
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
    SAFE_FOR_TEMPLATES: false,
    WHOLE_DOCUMENT: false,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
    RETURN_TRUSTED_TYPE: false
};
export const sanitizeHTML = (html) => {
    try {
        let cleanedHTML = html;
        cleanedHTML = cleanedHTML.replace(/javascript:[^"']*/gi, '');
        cleanedHTML = cleanedHTML.replace(/on\w+\s*=/gi, '');
        cleanedHTML = cleanedHTML.replace(/data:\w+\/[^;]+;base64,[\w+/=]+/gi, '');
        const sanitized = DOMPurify.sanitize(cleanedHTML, sanitizeConfig);
        return sanitized;
    }
    catch (error) {
        console.error('Error sanitizing HTML:', error);
        return '';
    }
};
export const validateHTMLFile = (file) => {
    const validExtensions = ['.html', '.htm'];
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    if (!validExtensions.includes(fileExtension)) {
        return { isValid: false, error: 'Định dạng file không hợp lệ. Chỉ chấp nhận .html và .htm' };
    }
    const validMimeTypes = ['text/html', 'application/html', 'text/plain'];
    if (file.type && !validMimeTypes.some(type => file.type.includes(type))) {
        return { isValid: false, error: 'Loại file không được hỗ trợ' };
    }
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
        return { isValid: false, error: 'File quá lớn. Kích thước tối đa: 10MB' };
    }
    const fileName = file.name.toLowerCase();
    const suspiciousPatterns = [
        /\.\./,
        /\//,
        /\\/,
        /^con$/i,
        /^prn$/i,
        /^aux$/i,
        /^nul$/i,
        /^com[1-9]$/i,
        /^lpt[1-9]$/i
    ];
    if (suspiciousPatterns.some(pattern => pattern.test(fileName))) {
        return { isValid: false, error: 'Tên file chứa ký tự không hợp lệ' };
    }
    return { isValid: true };
};
export const extractTitleFromHTML = (html) => {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return titleMatch ? titleMatch[1].trim() : 'Untitled Document';
};
export const extractDescriptionFromHTML = (html) => {
    const descMatch = html.match(/<meta[^>]*name=['"]description['"][^>]*content=['"]([^'"]+)['"][^>]*>/i);
    return descMatch ? descMatch[1].trim() : '';
};
export const cleanHTMLForEditor = (html) => {
    let cleaned = html;
    cleaned = cleaned.replace(/<\/?(html|head|body)[^>]*>/gi, '');
    cleaned = cleaned.replace(/<(meta|title|link|base|style)[^>]*>.*?<\/\1>/gi, '');
    cleaned = cleaned.replace(/<(meta|link|base)[^>]*>/gi, '');
    cleaned = cleaned.replace(/<script[^>]*>.*?<\/script>/gi, '');
    cleaned = cleaned.replace(/<script[^>]*>/gi, '');
    cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');
    cleaned = cleaned.replace(/\n\s*\n/g, '\n');
    cleaned = cleaned.trim();
    return cleaned;
};
export const parseHTMLFile = async (file) => {
    const validation = validateHTMLFile(file);
    if (!validation.isValid) {
        return {
            content: '',
            title: '',
            description: '',
            error: validation.error
        };
    }
    try {
        const htmlContent = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result);
            reader.onerror = () => reject(new Error('Không thể đọc file'));
            reader.readAsText(file);
        });
        const title = extractTitleFromHTML(htmlContent);
        const description = extractDescriptionFromHTML(htmlContent);
        const cleanedHTML = cleanHTMLForEditor(htmlContent);
        const sanitizedContent = sanitizeHTML(cleanedHTML);
        return {
            content: sanitizedContent,
            title,
            description,
            error: undefined
        };
    }
    catch (error) {
        return {
            content: '',
            title: '',
            description: '',
            error: 'Lỗi khi xử lý file HTML'
        };
    }
};
export const createSafeLink = (href) => {
    try {
        const url = new URL(href);
        const safeProtocols = ['http:', 'https:', 'mailto:', 'tel:', 'tel:'];
        if (!safeProtocols.includes(url.protocol)) {
            return '#';
        }
        if (url.protocol === 'http:' || url.protocol === 'https:') {
            return href;
        }
        return href;
    }
    catch {
        return '#';
    }
};
export const validateHTMLContent = (htmlContent) => {
    const warnings = [];
    try {
        if (!htmlContent.includes('<') || !htmlContent.includes('>')) {
            return { isValid: false, error: 'File không có cấu trúc HTML hợp lệ' };
        }
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
        ];
        const foundDangerous = dangerousPatterns.find(pattern => pattern.test(htmlContent));
        if (foundDangerous) {
            warnings.push('File chứa nội dung có khả năng gây hại, sẽ được tự động làm sạch');
        }
        if (htmlContent.length > 5_000_000) {
            warnings.push('File rất lớn, có thể ảnh hưởng đến hiệu suất xử lý');
        }
        const openTagMatches = htmlContent.match(/<[^>]+>/g) || [];
        if (openTagMatches.length > 10000) {
            warnings.push('File chứa quá nhiều thẻ HTML, có thể ảnh hưởng đến hiệu suất');
        }
        const hasHtmlTag = /<html/i.test(htmlContent);
        const hasHeadTag = /<head/i.test(htmlContent);
        const hasBodyTag = /<body/i.test(htmlContent);
        if (hasHtmlTag && (!hasHeadTag || !hasBodyTag)) {
            warnings.push('Cấu trúc HTML không hoàn chỉnh, nhưng vẫn có thể xử lý được');
        }
        return {
            isValid: true,
            warnings: warnings.length > 0 ? warnings : undefined
        };
    }
    catch (error) {
        return {
            isValid: false,
            error: 'Lỗi khi phân tích nội dung HTML'
        };
    }
};
export const HTMLUtils = {
    sanitizeHTML,
    validateHTMLFile,
    validateHTMLContent,
    extractTitleFromHTML,
    extractDescriptionFromHTML,
    cleanHTMLForEditor,
    parseHTMLFile,
    createSafeLink
};
