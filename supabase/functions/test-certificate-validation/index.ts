import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TestRequest {
  certificate_url: string;
  participant_name: string;
}

// Function to validate base64 PDF data
function validatePdfBase64(dataUrl: string): {
  isValid: boolean;
  errors: string[];
  metadata: {
    originalLength: number;
    cleanedLength: number;
    estimatedFileSize: number;
    hasValidHeader: boolean;
    hasValidPadding: boolean;
  };
} {
  const errors: string[] = [];
  const metadata = {
    originalLength: 0,
    cleanedLength: 0,
    estimatedFileSize: 0,
    hasValidHeader: false,
    hasValidPadding: false,
  };

  // Check data URL format
  if (!dataUrl.startsWith('data:application/pdf;base64,')) {
    errors.push('Invalid data URL format - must start with data:application/pdf;base64,');
    return { isValid: false, errors, metadata };
  }

  metadata.hasValidHeader = true;

  // Extract base64 data
  const base64Data = dataUrl.split(',')[1];
  if (!base64Data) {
    errors.push('No base64 data found after comma');
    return { isValid: false, errors, metadata };
  }

  metadata.originalLength = base64Data.length;

  // Clean base64 data
  const cleanedBase64 = base64Data.replace(/\s+/g, '').replace(/[^A-Za-z0-9+/=]/g, '');
  metadata.cleanedLength = cleanedBase64.length;

  // Check if data was lost during cleaning
  if (cleanedBase64.length < base64Data.length * 0.95) {
    errors.push('Significant data loss detected during base64 cleaning');
  }

  // Validate base64 format
  if (!/^[A-Za-z0-9+/]+=*$/.test(cleanedBase64)) {
    errors.push('Invalid base64 characters found');
  }

  // Check padding
  const paddingCount = (cleanedBase64.match(/=/g) || []).length;
  if (paddingCount > 2) {
    errors.push('Invalid base64 padding - too many = characters');
  } else if (cleanedBase64.length % 4 !== 0) {
    errors.push('Invalid base64 length - not multiple of 4');
  } else {
    metadata.hasValidPadding = true;
  }

  // Estimate decoded file size
  metadata.estimatedFileSize = Math.floor((cleanedBase64.length * 3) / 4) - paddingCount;

  // Check minimum size
  if (metadata.estimatedFileSize < 1000) {
    errors.push('Estimated file size too small for a valid PDF');
  }

  // Check maximum reasonable size (50MB)
  if (metadata.estimatedFileSize > 50 * 1024 * 1024) {
    errors.push('Estimated file size too large (>50MB)');
  }

  // Try to decode a small portion to test validity
  try {
    const testPortion = cleanedBase64.substring(0, Math.min(100, cleanedBase64.length));
    atob(testPortion);
  } catch (e) {
    errors.push('Base64 decode test failed: ' + e.message);
  }

  return {
    isValid: errors.length === 0,
    errors,
    metadata
  };
}

// Function to generate test MIME message
function generateTestMimeMessage(base64Data: string, filename: string): string {
  const boundary = `----=TestBoundary_${Date.now()}`;
  const cleanBase64 = base64Data.replace(/\s+/g, '');
  const base64Lines = cleanBase64.match(/.{1,76}/g) || [];
  const formattedBase64 = base64Lines.join('\r\n');

  return [
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain',
    '',
    'This is a test certificate attachment.',
    '',
    `--${boundary}`,
    `Content-Type: application/pdf; name="${filename}"`,
    `Content-Disposition: attachment; filename="${filename}"`,
    'Content-Transfer-Encoding: base64',
    '',
    formattedBase64,
    '',
    `--${boundary}--`
  ].join('\r\n');
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { 
      status: 405, 
      headers: corsHeaders 
    });
  }

  try {
    const testData: TestRequest = await req.json();

    console.log('🧪 Testing certificate validation for:', testData.participant_name);

    // Validate certificate data
    const validation = validatePdfBase64(testData.certificate_url);

    // Generate test MIME message
    const base64Data = testData.certificate_url.split(',')[1];
    const filename = `Test_${testData.participant_name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    const mimeMessage = generateTestMimeMessage(base64Data, filename);

    const result = {
      participant_name: testData.participant_name,
      validation: validation,
      mime_preview: mimeMessage.substring(0, 500) + '...',
      mime_size: mimeMessage.length,
      generated_filename: filename,
      test_timestamp: new Date().toISOString(),
      status: validation.isValid ? 'PASS' : 'FAIL'
    };

    console.log('🧪 Test results:', {
      status: result.status,
      errors: validation.errors,
      estimated_size: validation.metadata.estimatedFileSize
    });

    return new Response(
      JSON.stringify(result, null, 2),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Test error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Test failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
};

serve(handler);