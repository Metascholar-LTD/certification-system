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
  Eye
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
  const [certificates, setCertificates] = useState<any[]>([]);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [sendingFor, setSendingFor] = useState<string | null>(null);

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

  // Upload certificate for individual participant
  const uploadCertificateForParticipant = async (participant: Participant, file: File) => {
    setUploadingFor(participant.id);
    
    try {
      // Convert file to data URL
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      // Generate unique certificate number
      const certificateNumber = `CERT-${Date.now()}-${participant.name.replace(/\s+/g, '')}`;

             // Check if certificate already exists
       const { data: existingCert } = await supabase
         .from('certificates')
         .select('id')
         .eq('registration_id', participant.id)
         .maybeSingle();

       const certificateData = {
         certificate_url: dataUrl,
         certificate_number: certificateNumber,
         certificate_type: 'pdf', // Only PDF type supported
         status: 'issued',
         issued_at: new Date().toISOString(),
       };

      if (existingCert) {
        // Update existing certificate
        const { error: updateError } = await supabase
          .from('certificates')
          .update(certificateData)
          .eq('id', existingCert.id);

        if (updateError) throw updateError;
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
      }

             toast({
         title: "Certificate Uploaded",
         description: `PDF certificate for ${participant.name} has been uploaded successfully`,
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
    }
  };

  // Send certificate to individual participant
  const sendCertificateToParticipant = async (participant: Participant) => {
    setSendingFor(participant.id);
    
    try {
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
        title: "Certificate Sent",
        description: `Certificate successfully sent to ${participant.name} at ${participant.email}`,
      });
      
      // Refresh data
      await fetchWebhookRegistrations();
      
    } catch (error) {
      console.error('Certificate sending error:', error);
      toast({
        title: "Sending Failed",
        description: error instanceof Error ? error.message : "Failed to send certificate",
        variant: "destructive",
      });
    } finally {
      setSendingFor(null);
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
                  <CardTitle>Individual Certificate Management</CardTitle>
                  <CardDescription>
                    Upload and send certificates for each participant individually.
                  </CardDescription>
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
                                   if (file && file.type === 'application/pdf') {
                                     uploadCertificateForParticipant(participant, file);
                                   } else if (file) {
                                     toast({
                                       title: "Invalid File Type",
                                       description: "Please upload a PDF file only",
                                       variant: "destructive",
                                     });
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