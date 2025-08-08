import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  Upload, 
  FileText, 
  Mail, 
  Award, 
  Download, 
  Users, 
  CheckCircle,
  AlertCircle,
  Home,
  RefreshCw,
  Eye,
  Send
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import EmailParticipants from "@/components/EmailParticipants";

interface Participant {
  id: string;
  name: string;
  email: string;
  course: string;
  completionDate: string;
  status: 'pending' | 'issued' | 'sent';
  registration_id: string;
  webinar_date: string;
  time_zone: string;
  registration_type?: string;
}

export default function Certification() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [emailSubject, setEmailSubject] = useState("Your Certificate from Metascholar Institute");
  const [emailMessage, setEmailMessage] = useState("Congratulations on completing the course! Please find your certificate attached.");
  const [isLoading, setIsLoading] = useState(true);
  const [certificates, setCertificates] = useState<{
    id: string;
    registration_id: string;
    certificate_url: string;
    certificate_number: string;
    status: string;
    file_size?: number;
    original_filename?: string;
  }[]>([]);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [sendingFor, setSendingFor] = useState<string | null>(null);
  const [sendingAll, setSendingAll] = useState(false);

  // Fetch webhook registrations from database
  const fetchWebhookRegistrations = async () => {
    try {
      setIsLoading(true);
      console.log('Fetching webhook registrations...');
      
      const { data, error } = await supabase
        .from('webhook_registrations')
        .select('*')
        .order('created_at', { ascending: false });

      console.log('Supabase response:', { data, error });

      if (error) {
        console.error('Error fetching webhook registrations:', error);
        toast({
          title: "Error Loading Data",
          description: `Failed to load participant registrations: ${error.message}`,
          variant: "destructive",
        });
        return;
      }

      // Get certificate status for each registration
      const { data: certificatesData } = await supabase
        .from('certificates')
        .select('*');

      setCertificates(certificatesData || []);

      const certificateStatusMap = new Map(
        certificatesData?.map(cert => [cert.registration_id, cert.status]) || []
      );

      // Transform webhook data to participant format
      const transformedParticipants: Participant[] = data.map((registration) => {
        const certStatus = certificateStatusMap.get(registration.id);
        let status: 'pending' | 'issued' | 'sent' = 'pending';
        
        if (certStatus === 'sent') status = 'sent';
        else if (certStatus === 'issued') status = 'issued';

        return {
          id: registration.id,
          registration_id: registration.registration_id,
          name: registration.participant_name,
          email: registration.participant_email,
          course: registration.webinar_title,
          completionDate: new Date(registration.webinar_date).toLocaleDateString(),
          webinar_date: registration.webinar_date,
          time_zone: registration.time_zone,
          registration_type: registration.registration_type || 'free',
          status
        };
      });

      setParticipants(transformedParticipants);
      toast({
        title: "Data Loaded Successfully",
        description: `Found ${transformedParticipants.length} registered participants`,
      });
    } catch (error) {
      console.error('Unexpected error:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Load data on component mount
  useEffect(() => {
    fetchWebhookRegistrations();
  }, []);

  const refreshData = () => {
    fetchWebhookRegistrations();
  };

  // Upload certificate for individual participant with enhanced validation
  const uploadCertificateForParticipant = async (participant: Participant, file: File) => {
    setUploadingFor(participant.id);
    
    try {
      console.log(`📄 [Debug] Uploading PDF for ${participant.name}`);
      console.log(`📄 [Debug] File size: ${file.size} bytes`);
      console.log(`📄 [Debug] File type: ${file.type}`);
      console.log(`📄 [Debug] File name: ${file.name}`);
      
      // Validate file
      if (file.type !== 'application/pdf') {
        throw new Error('Only PDF files are allowed');
      }
      
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        throw new Error('File size must be less than 10MB');
      }
      
      if (file.size < 1000) { // Minimum size check
        throw new Error('File appears to be too small or corrupted');
      }
      
      // Convert file to data URL with better error handling
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = () => {
          const result = reader.result as string;
          console.log(`📄 [Debug] Data URL length: ${result.length}`);
          console.log(`📄 [Debug] Data URL starts with: ${result.substring(0, 50)}`);
          
          // Validate the data URL
          if (!result.startsWith('data:application/pdf;base64,')) {
            reject(new Error('Invalid PDF data format'));
            return;
          }
          
          const base64Data = result.split(',')[1];
          if (!base64Data || base64Data.length < 100) {
            reject(new Error('Invalid or insufficient PDF data'));
            return;
          }
          
          // Test base64 validity
          try {
            // Clean the base64 string and validate format
            const cleanBase64 = base64Data.replace(/\s+/g, '');
            if (!/^[A-Za-z0-9+/]+=*$/.test(cleanBase64)) {
              reject(new Error('Invalid base64 encoding detected'));
              return;
            }
            
            console.log(`📄 [Debug] Base64 validation passed - length: ${cleanBase64.length}`);
          } catch (error) {
            reject(new Error('Base64 validation failed'));
            return;
          }
          
          resolve(result);
        };
        
        reader.onerror = () => {
          reject(new Error('Failed to read file'));
        };
        
        reader.readAsDataURL(file);
      });

      // Generate unique certificate number with better formatting
      const timestamp = Date.now();
      const safeName = participant.name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 10);
      const certificateNumber = `CERT-${timestamp}-${safeName}`.toUpperCase();

      console.log(`📄 [Debug] Certificate number: ${certificateNumber}`);

      // Check if certificate already exists
      const { data: existingCert } = await supabase
        .from('certificates')
        .select('id')
        .eq('registration_id', participant.id)
        .maybeSingle();

      const certificateData = {
        certificate_url: dataUrl,
        certificate_number: certificateNumber,
        certificate_type: 'pdf',
        status: 'issued',
        issued_at: new Date().toISOString(),
        file_size: file.size,
        original_filename: file.name,
      };

      if (existingCert) {
        // Update existing certificate
        const { error: updateError } = await supabase
          .from('certificates')
          .update(certificateData)
          .eq('id', existingCert.id);

        if (updateError) throw updateError;
        console.log(`📄 [Debug] Updated existing certificate for ${participant.name}`);
      } else {
        // Create new certificate record
        const { error: insertError } = await supabase
          .from('certificates')
          .insert({
            registration_id: participant.id,
            participant_name: participant.name,
            participant_email: participant.email,
            ...certificateData,
          });

        if (insertError) throw insertError;
        console.log(`📄 [Debug] Created new certificate for ${participant.name}`);
      }

      toast({
        title: "Certificate Uploaded Successfully",
        description: `PDF certificate for ${participant.name} (${(file.size / 1024).toFixed(1)} KB) uploaded and validated`,
      });
      
      // Refresh data
      await fetchWebhookRegistrations();
      
    } catch (error) {
      console.error('Certificate upload error:', error);
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "Failed to upload certificate",
        variant: "destructive",
      });
    } finally {
      setUploadingFor(null);
      // Clear the file input
      const fileInput = document.getElementById(`upload-${participant.id}`) as HTMLInputElement;
      if (fileInput) {
        fileInput.value = '';
      }
    }
  };

  // Send certificate to individual participant with enhanced validation
  const sendCertificateToParticipant = async (participant: Participant) => {
    setSendingFor(participant.id);
    
    try {
      console.log(`📧 [Debug] Sending certificate to ${participant.name} at ${participant.email}`);
      
      // Get certificate for this participant
      const certificate = certificates.find(cert => cert.registration_id === participant.id);
      
      if (!certificate || !certificate.certificate_url) {
        toast({
          title: "No Certificate Found",
          description: `Please upload a certificate for ${participant.name} first`,
          variant: "destructive",
        });
        return;
      }
      
      // Validate certificate data before sending
      if (!certificate.certificate_url.startsWith('data:application/pdf;base64,')) {
        toast({
          title: "Invalid Certificate Format",
          description: `Certificate for ${participant.name} is not in valid PDF format`,
          variant: "destructive",
        });
        return;
      }
      
      const base64Data = certificate.certificate_url.split(',')[1];
      if (!base64Data || base64Data.length < 100) {
        toast({
          title: "Corrupted Certificate Data",
          description: `Certificate data for ${participant.name} appears to be corrupted`,
          variant: "destructive",
        });
        return;
      }

      console.log(`📧 [Debug] Certificate validation passed for ${participant.name}`);
      console.log(`📧 [Debug] Certificate URL length: ${certificate.certificate_url.length}`);
      console.log(`📧 [Debug] Base64 data length: ${base64Data.length}`);
      console.log(`📧 [Debug] Certificate number: ${certificate.certificate_number}`);

      // Send email using Supabase Edge Function
      const { data: emailResult, error: emailError } = await supabase.functions.invoke('send-certificate-email', {
        body: {
          to: participant.email,
          subject: emailSubject,
          message: emailMessage,
          participant_name: participant.name,
          certificate_number: certificate.certificate_number,
          certificate_url: certificate.certificate_url
        }
      });

      if (emailError) {
        console.error('Email sending error:', emailError);
        throw new Error(`Failed to send email to ${participant.email}`);
      }

      console.log(`📧 [Debug] Email sent successfully to ${participant.email}`);

      // Update certificate status to sent
      const { error: updateError } = await supabase
        .from('certificates')
        .update({ 
          status: 'sent', 
          sent_at: new Date().toISOString() 
        })
        .eq('id', certificate.id);

      if (updateError) {
        console.error('Error updating certificate status:', updateError);
        throw new Error(`Failed to update certificate status`);
      }

      toast({
        title: "Certificate Sent Successfully",
        description: `Certificate delivered to ${participant.name} at ${participant.email}. The exact PDF file you uploaded has been sent.`,
      });
      
      // Refresh data
      await fetchWebhookRegistrations();
      
    } catch (error) {
      console.error('Certificate sending error:', error);
      toast({
        title: "Certificate Sending Failed",
        description: error instanceof Error ? error.message : "Failed to send certificate. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSendingFor(null);
    }
  };

  // Send all certificates at once
  const sendAllCertificates = async () => {
    setSendingAll(true);
    
    try {
      console.log('📧 [Debug] Starting bulk certificate sending...');
      
      // Get all participants with uploaded certificates that haven't been sent yet
      const participantsToSend = participants.filter(participant => {
        const certificate = certificates.find(cert => cert.registration_id === participant.id);
        return certificate?.certificate_url && participant.status !== 'sent';
      });
      
      if (participantsToSend.length === 0) {
        toast({
          title: "No Certificates to Send",
          description: "All certificates have already been sent or no certificates are uploaded.",
          variant: "destructive",
        });
        return;
      }

      console.log(`📧 [Debug] Found ${participantsToSend.length} certificates to send`);
      
      let successCount = 0;
      let failureCount = 0;
      const failures: string[] = [];

      // Send certificates sequentially to avoid overwhelming the email service
      for (const participant of participantsToSend) {
        try {
          const certificate = certificates.find(cert => cert.registration_id === participant.id);
          
          if (!certificate?.certificate_url) {
            console.log(`📧 [Debug] Skipping ${participant.name} - no certificate found`);
            continue;
          }
          
          // Validate certificate data before sending
          if (!certificate.certificate_url.startsWith('data:application/pdf;base64,')) {
            console.log(`📧 [Debug] Skipping ${participant.name} - invalid certificate format`);
            failures.push(`${participant.name} (Invalid format)`);
            failureCount++;
            continue;
          }
          
          const base64Data = certificate.certificate_url.split(',')[1];
          if (!base64Data || base64Data.length < 100) {
            console.log(`📧 [Debug] Skipping ${participant.name} - corrupted certificate data`);
            failures.push(`${participant.name} (Corrupted data)`);
            failureCount++;
            continue;
          }

          console.log(`📧 [Debug] Sending certificate to ${participant.name}...`);

          // Send email using Supabase Edge Function
          const { data: emailResult, error: emailError } = await supabase.functions.invoke('send-certificate-email', {
            body: {
              to: participant.email,
              subject: emailSubject,
              message: emailMessage,
              participant_name: participant.name,
              certificate_number: certificate.certificate_number,
              certificate_url: certificate.certificate_url
            }
          });

          if (emailError) {
            console.error(`📧 [Debug] Email sending error for ${participant.name}:`, emailError);
            failures.push(`${participant.name} (${emailError.message})`);
            failureCount++;
            continue;
          }

          console.log(`📧 [Debug] Email sent successfully to ${participant.name}`);

          // Update certificate status to sent
          const { error: updateError } = await supabase
            .from('certificates')
            .update({ 
              status: 'sent', 
              sent_at: new Date().toISOString() 
            })
            .eq('id', certificate.id);

          if (updateError) {
            console.error(`📧 [Debug] Error updating certificate status for ${participant.name}:`, updateError);
            // Don't count this as a failure since the email was sent
          }

          successCount++;
          
          // Add a small delay between sends to be respectful to the email service
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          console.error(`📧 [Debug] Error sending certificate to ${participant.name}:`, error);
          failures.push(`${participant.name} (${error instanceof Error ? error.message : 'Unknown error'})`);
          failureCount++;
        }
      }

      // Show results
      if (successCount > 0 && failureCount === 0) {
        toast({
          title: "All Certificates Sent Successfully! 🎉",
          description: `Successfully sent ${successCount} certificates to participants.`,
        });
      } else if (successCount > 0 && failureCount > 0) {
        toast({
          title: `Partial Success: ${successCount} Sent, ${failureCount} Failed`,
          description: `Successfully sent: ${successCount}. Failed: ${failures.join(', ')}`,
          variant: "default",
        });
      } else {
        toast({
          title: "All Certificates Failed to Send",
          description: `Failed to send certificates: ${failures.join(', ')}`,
          variant: "destructive",
        });
      }
      
      // Refresh data to update the UI
      await fetchWebhookRegistrations();
      
    } catch (error) {
      console.error('📧 [Debug] Bulk certificate sending error:', error);
      toast({
        title: "Bulk Send Failed",
        description: error instanceof Error ? error.message : "Failed to send certificates. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSendingAll(false);
    }
  };

  const getStatusBadge = (status: Participant['status']) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary"><AlertCircle className="w-3 h-3 mr-1" />Pending</Badge>;
      case 'issued':
        return <Badge variant="default"><Award className="w-3 h-3 mr-1" />Issued</Badge>;
      case 'sent':
        return <Badge variant="outline" className="border-green-500 text-green-600"><CheckCircle className="w-3 h-3 mr-1" />Sent</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" onClick={() => navigate('/')}>
                <Home className="w-4 h-4 mr-2" />
                Back to Home
              </Button>
              <div>
                <h1 className="text-2xl font-bold">Certification Management</h1>
                <p className="text-muted-foreground">Metascholar Institute</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Button variant="outline" size="sm" onClick={refreshData} disabled={isLoading}>
                <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh Data
              </Button>
              <div className="flex items-center space-x-2">
                <Users className="w-5 h-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {participants.length} Participants
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <Tabs defaultValue="participants" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="participants">📋 Certificate Management</TabsTrigger>
            <TabsTrigger value="email-participants">📧 General Communication</TabsTrigger>
            <TabsTrigger value="email-settings">⚙️ Configure Email</TabsTrigger>
          </TabsList>

          <TabsContent value="participants" className="space-y-6">
            {/* Stats Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Users className="w-5 h-5 mr-2" />
                  Certificate Management Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-blue-600">{participants.length}</div>
                    <div className="text-sm text-muted-foreground">Total Registered</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-orange-600">
                      {participants.filter(p => p.status === 'pending').length}
                    </div>
                    <div className="text-sm text-muted-foreground">Pending Certificates</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-purple-600">
                      {participants.filter(p => p.status === 'issued').length}
                    </div>
                    <div className="text-sm text-muted-foreground">Ready to Send</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-600">
                      {participants.filter(p => p.status === 'sent').length}
                    </div>
                    <div className="text-sm text-muted-foreground">Certificates Sent</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Individual Certificate Management */}
            {isLoading ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Loading registered participants...</p>
                </CardContent>
              </Card>
            ) : participants.length > 0 ? (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Individual Certificate Management</CardTitle>
                      <CardDescription>
                        Upload and send certificates for each participant individually.
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Ready to Send Count */}
                      {(() => {
                        const readyToSend = participants.filter(p => certificates.find(c => c.registration_id === p.id)?.certificate_url && p.status !== 'sent').length;
                        return readyToSend > 0 && (
                          <div className="text-sm text-muted-foreground bg-blue-50 px-3 py-1 rounded-full border">
                            <Award className="w-3 h-3 inline mr-1" />
                            {readyToSend} ready to send
                          </div>
                        );
                      })()}
                      
                      {/* Send All Button */}
                      <Button
                        onClick={sendAllCertificates}
                        disabled={sendingAll || participants.filter(p => certificates.find(c => c.registration_id === p.id)?.certificate_url && p.status !== 'sent').length === 0}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        {sendingAll ? (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            Sending All...
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4 mr-2" />
                            Send All Certificates
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {participants.map((participant) => {
                      const certificate = certificates.find(cert => cert.registration_id === participant.id);
                      const isUploading = uploadingFor === participant.id;
                      const isSending = sendingFor === participant.id;
                      
                      return (
                        <div key={participant.id} className="border rounded-lg p-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-center">
                            {/* Participant Info */}
                            <div>
                              <h4 className="font-semibold">{participant.name}</h4>
                              <p className="text-sm text-muted-foreground">{participant.email}</p>
                              <p className="text-xs text-muted-foreground">{participant.course}</p>
                            </div>
                            
                            {/* Certificate Status */}
                            <div className="text-center">
                              <div className="mb-2">{getStatusBadge(participant.status)}</div>
                              {certificate?.certificate_number && (
                                <p className="text-xs font-mono text-muted-foreground">
                                  {certificate.certificate_number}
                                </p>
                              )}
                            </div>
                            
                            {/* Certificate Upload */}
                            <div>
                                                             <input
                                 type="file"
                                 accept=".pdf"
                                 style={{ display: 'none' }}
                                 id={`upload-${participant.id}`}
                                 onChange={(e) => {
                                   const file = e.target.files?.[0];
                                   if (file) {
                                     if (file.type !== 'application/pdf') {
                                       toast({
                                         title: "Invalid File Type",
                                         description: "Please upload a PDF file only",
                                         variant: "destructive",
                                       });
                                       e.target.value = ''; // Clear the input
                                       return;
                                     }
                                     
                                     if (file.size > 10 * 1024 * 1024) {
                                       toast({
                                         title: "File Too Large",
                                         description: "Please upload a PDF file smaller than 10MB",
                                         variant: "destructive",
                                       });
                                       e.target.value = ''; // Clear the input
                                       return;
                                     }
                                     
                                     uploadCertificateForParticipant(participant, file);
                                   }
                                 }}
                               />
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={isUploading}
                                onClick={() => document.getElementById(`upload-${participant.id}`)?.click()}
                              >
                                {isUploading ? (
                                  <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                                ) : (
                                  <Upload className="w-3 h-3 mr-1" />
                                )}
                                {certificate ? 'Replace' : 'Upload'} Certificate
                              </Button>
                            </div>
                            
                            {/* Actions */}
                            <div className="flex gap-2">
                              {certificate?.certificate_url && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                                                     onClick={() => {
                                     const fileExtension = 'pdf';
                                     
                                     const newWindow = window.open('', '_blank', 'width=900,height=700,scrollbars=yes,resizable=yes');
                                    if (newWindow) {
                                      newWindow.document.write(`
                                        <!DOCTYPE html>
                                        <html>
                                          <head>
                                            <meta charset="utf-8">
                                            <title>Certificate Preview - ${participant.name}</title>
                                            <style>
                                              body { 
                                                margin: 0; 
                                                padding: 20px; 
                                                text-align: center; 
                                                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                                                background: #f5f5f5;
                                              }
                                              .container {
                                                max-width: 900px;
                                                margin: 0 auto;
                                                background: white;
                                                border-radius: 10px;
                                                box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                                                padding: 30px;
                                              }
                                              h1 { 
                                                color: #2563eb; 
                                                margin-bottom: 10px;
                                                font-size: 28px;
                                              }
                                              .info {
                                                background: #f8fafc;
                                                padding: 15px;
                                                border-radius: 8px;
                                                margin: 20px 0;
                                                border-left: 4px solid #2563eb;
                                              }
                                              .certificate-container {
                                                margin: 20px 0;
                                                border: 2px solid #e5e7eb;
                                                border-radius: 10px;
                                                overflow: hidden;
                                                background: white;
                                                min-height: 400px;
                                              }
                                              .certificate-img { 
                                                max-width: 100%; 
                                                height: auto; 
                                                display: block;
                                              }
                                              .pdf-viewer {
                                                width: 100%;
                                                height: 500px;
                                                border: none;
                                              }
                                              .loading {
                                                padding: 40px;
                                                color: #666;
                                              }
                                              .error {
                                                padding: 40px;
                                                color: #dc2626;
                                                background: #fef2f2;
                                                border-radius: 8px;
                                                margin: 20px;
                                              }
                                              .file-type {
                                                display: inline-block;
                                                background: #2563eb;
                                                color: white;
                                                padding: 4px 8px;
                                                border-radius: 4px;
                                                font-size: 12px;
                                                margin-left: 10px;
                                              }
                                              .actions {
                                                margin-top: 20px;
                                              }
                                              .btn {
                                                background: #2563eb;
                                                color: white;
                                                padding: 10px 20px;
                                                border: none;
                                                border-radius: 6px;
                                                margin: 0 10px;
                                                cursor: pointer;
                                                font-size: 14px;
                                              }
                                              .btn:hover {
                                                background: #1d4ed8;
                                              }
                                              .btn-secondary {
                                                background: #6b7280;
                                              }
                                              .btn-secondary:hover {
                                                background: #4b5563;
                                              }
                                            </style>
                                          </head>
                                          <body>
                                                                                         <div class="container">
                                               <h1>🎓 Certificate Preview <span class="file-type">PDF</span></h1>
                                               
                                               <div class="info">
                                                 <p><strong>Participant:</strong> ${participant.name}</p>
                                                 <p><strong>Email:</strong> ${participant.email}</p>
                                                 <p><strong>Certificate Number:</strong> ${certificate.certificate_number}</p>
                                                 <p><strong>Course:</strong> ${participant.course}</p>
                                                 <p><strong>Type:</strong> PDF Document</p>
                                               </div>
                                               
                                               <div class="certificate-container">
                                                 <div id="loading" class="loading">
                                                   Loading certificate...
                                                 </div>
                                                 
                                                 <iframe 
                                                   id="pdfViewer" 
                                                   class="pdf-viewer" 
                                                   style="display: none;"
                                                   onload="
                                                     document.getElementById('loading').style.display = 'none';
                                                     this.style.display = 'block';
                                                   "
                                                   onerror="
                                                     document.getElementById('loading').style.display = 'none';
                                                     document.getElementById('error').style.display = 'block';
                                                   "
                                                 ></iframe>
                                                 
                                                 <div id="error" class="error" style="display: none;">
                                                   ❌ Failed to load certificate.<br>
                                                   PDF file may be corrupted or browser does not support PDF viewing.
                                                   <br><br>
                                                   <button class="btn" onclick="downloadCertificate()">
                                                     📥 Download Certificate Instead
                                                   </button>
                                                 </div>
                                               </div>
                                               
                                               <div class="actions">
                                                 <button class="btn" onclick="downloadCertificate()">
                                                   📥 Download Certificate
                                                 </button>
                                                 <button class="btn btn-secondary" onclick="openInNewTab()">
                                                   🔗 Open PDF in New Tab
                                                 </button>
                                                 <button class="btn btn-secondary" onclick="window.close()">
                                                   ✕ Close Preview
                                                 </button>
                                               </div>
                                             </div>
                                             
                                             <script>
                                               const certificateData = ${JSON.stringify(certificate.certificate_url)};
                                               
                                               document.addEventListener('DOMContentLoaded', function() {
                                                 if (certificateData) {
                                                   // For PDF files, use iframe
                                                   const pdfViewer = document.getElementById('pdfViewer');
                                                   if (pdfViewer) {
                                                     pdfViewer.src = certificateData;
                                                   }
                                                 } else {
                                                   document.getElementById('loading').style.display = 'none';
                                                   document.getElementById('error').style.display = 'block';
                                                   document.getElementById('error').innerHTML = '❌ No certificate data found.';
                                                 }
                                               });
                                               
                                               function downloadCertificate() {
                                                 const link = document.createElement('a');
                                                 link.href = certificateData;
                                                 link.download = 'Certificate_${participant.name.replace(/[^a-zA-Z0-9]/g, '_')}_${certificate.certificate_number}.pdf';
                                                 document.body.appendChild(link);
                                                 link.click();
                                                 document.body.removeChild(link);
                                               }
                                               
                                               function openInNewTab() {
                                                 const newTab = window.open('', '_blank');
                                                 if (newTab) {
                                                   newTab.location.href = certificateData;
                                                 }
                                               }
                                               
                                               // Debug logging
                                               console.log('Certificate Type: PDF');
                                               console.log('Certificate Data Length:', certificateData ? certificateData.length : 0);
                                               console.log('Data URL Preview:', certificateData ? certificateData.substring(0, 100) + '...' : 'No data');
                                             </script>
                                          </body>
                                        </html>
                                      `);
                                      newWindow.document.close();
                                    }
                                  }}
                                >
                                  <Eye className="w-3 h-3 mr-1" />
                                  Preview
                                </Button>
                              )}
                              
                              <Button
                                size="sm"
                                disabled={!certificate?.certificate_url || isSending}
                                onClick={() => sendCertificateToParticipant(participant)}
                              >
                                {isSending ? (
                                  <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                                ) : (
                                  <Mail className="w-3 h-3 mr-1" />
                                )}
                                Send Certificate
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">No Participants Found</h3>
                  <p className="text-muted-foreground mb-4">
                    No webhook registrations have been received yet.
                  </p>
                  <Button variant="outline" onClick={refreshData}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh Data
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="email-participants" className="space-y-6">
            <EmailParticipants participants={participants} isLoading={isLoading} />
          </TabsContent>

          <TabsContent value="email-settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Mail className="w-5 h-5 mr-2" />
                  Email Configuration
                </CardTitle>
                <CardDescription>
                  Configure email settings for certificate delivery.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4">
                  <div>
                    <Label htmlFor="email-subject">Email Subject</Label>
                    <Input
                      id="email-subject"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      placeholder="Your Certificate from Metascholar Institute"
                    />
                  </div>
                  <div>
                    <Label htmlFor="email-message">Email Message</Label>
                    <Textarea
                      id="email-message"
                      value={emailMessage}
                      onChange={(e) => setEmailMessage(e.target.value)}
                      rows={4}
                      placeholder="Congratulations on completing the course! Please find your certificate attached."
                    />
                  </div>
                </div>
                
                <div className="bg-muted p-4 rounded-lg">
                  <h4 className="font-semibold mb-2">Email Configuration</h4>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p><strong>From:</strong> Configured via Supabase SMTP Settings</p>
                    <p><strong>SMTP Server:</strong> Configured via Supabase SMTP Settings</p>
                    <p><strong>Status:</strong> <span className="text-green-600">✓ Configured</span></p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          
        </Tabs>
      </div>
    </div>
  );
}