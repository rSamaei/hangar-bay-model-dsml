import type {
    ValidationReport,
    ExportModel,
    ParseResult,
    LegacySimulationResult
} from '../types/api';

const API_BASE = 'http://localhost:3000/api';

export interface AnalysisResult {
    report: ValidationReport;
    exportModel: ExportModel;
    langiumDiagnostics?: ParseError[];  // Langium validation diagnostics (non-fatal)
}

export interface ParseError {
    message: string;
    severity?: number;
    line?: number;
    column?: number;
}

export class ApiError extends Error {
    public parseErrors: ParseError[];

    constructor(message: string, parseErrors: ParseError[] = []) {
        super(message);
        this.name = 'ApiError';
        this.parseErrors = parseErrors;
    }
}

export async function parseModel(dslCode: string): Promise<ParseResult> {
    const response = await fetch(`${API_BASE}/parse`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ dslCode }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new ApiError(
            errorData.error || 'Parse failed',
            errorData.parseErrors || []
        );
    }

    return await response.json();
}

export async function analyzeModel(dslCode: string): Promise<AnalysisResult> {
    const response = await fetch(`${API_BASE}/analyse`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ dslCode }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new ApiError(
            errorData.error || 'Analysis failed',
            errorData.parseErrors || []
        );
    }

    return await response.json();
}

export async function validateModel(dslCode: string): Promise<ValidationReport> {
    const response = await fetch(`${API_BASE}/validate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ dslCode }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Validation failed');
    }

    return await response.json();
}

export async function exportModel(dslCode: string, includeSchedule = false): Promise<ExportModel> {
    const response = await fetch(`${API_BASE}/export`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ dslCode, includeSchedule }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Export failed');
    }

    return await response.json();
}