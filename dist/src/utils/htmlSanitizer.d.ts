export declare const ALLOWED_HTML_TAGS: string[];
export declare const ALLOWED_HTML_ATTRS: string[];
export declare const sanitizeHTML: (html: string) => string;
export declare const validateHTMLFile: (file: File) => {
    isValid: boolean;
    error?: string;
};
export declare const extractTitleFromHTML: (html: string) => string;
export declare const extractDescriptionFromHTML: (html: string) => string;
export declare const cleanHTMLForEditor: (html: string) => string;
export declare const parseHTMLFile: (file: File) => Promise<{
    content: string;
    title: string;
    description: string;
    error?: string;
}>;
export declare const createSafeLink: (href: string) => string;
export declare const validateHTMLContent: (htmlContent: string) => {
    isValid: boolean;
    error?: string;
    warnings?: string[];
};
export declare const HTMLUtils: {
    sanitizeHTML: (html: string) => string;
    validateHTMLFile: (file: File) => {
        isValid: boolean;
        error?: string;
    };
    validateHTMLContent: (htmlContent: string) => {
        isValid: boolean;
        error?: string;
        warnings?: string[];
    };
    extractTitleFromHTML: (html: string) => string;
    extractDescriptionFromHTML: (html: string) => string;
    cleanHTMLForEditor: (html: string) => string;
    parseHTMLFile: (file: File) => Promise<{
        content: string;
        title: string;
        description: string;
        error?: string;
    }>;
    createSafeLink: (href: string) => string;
};
//# sourceMappingURL=htmlSanitizer.d.ts.map