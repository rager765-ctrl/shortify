// Live Analytics Tracking for Document Conversions and QR Codes Generated

export function recordDocConversion(count = 1) {
    try {
        const current = parseInt(localStorage.getItem('enly_stats_doc_conversions') || '14', 10);
        const updated = current + count;
        localStorage.setItem('enly_stats_doc_conversions', updated.toString());
        window.dispatchEvent(new CustomEvent('enly_stats_updated', { detail: { docConversions: updated } }));
    } catch (e) {
        console.error("Error recording doc conversion:", e);
    }
}

export function recordQRGenerated(count = 1) {
    try {
        const current = parseInt(localStorage.getItem('enly_stats_qr_generated') || '28', 10);
        const updated = current + count;
        localStorage.setItem('enly_stats_qr_generated', updated.toString());
        window.dispatchEvent(new CustomEvent('enly_stats_updated', { detail: { qrGenerated: updated } }));
    } catch (e) {
        console.error("Error recording QR generation:", e);
    }
}

export function getLiveAnalyticsStats() {
    try {
        const docConversions = parseInt(localStorage.getItem('enly_stats_doc_conversions') || '14', 10);
        const qrGenerated = parseInt(localStorage.getItem('enly_stats_qr_generated') || '28', 10);
        return { docConversions, qrGenerated };
    } catch (e) {
        return { docConversions: 14, qrGenerated: 28 };
    }
}
