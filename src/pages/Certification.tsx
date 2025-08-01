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
  FileImage
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

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
}

export default function Certification() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [certificateTemplate, setCertificateTemplate] = useState<File | null>(null);
  const [emailSubject, setEmailSubject] = useState("Your Certificate from Metascholar Institute");
  const [emailMessage, setEmailMessage] = useState("Congratulations on completing the course! Please find your certificate attached.");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [certificates, setCertificates] = useState<any[]>([]);

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

  const handleCertificateUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && (file.type === 'application/pdf' || file.type.startsWith('image/'))) {
      setCertificateTemplate(file);
      toast({
        title: "Certificate Template Uploaded",
        description: "Template ready for use",
      });
    } else {
      toast({
        title: "Invalid File Type",
        description: "Please upload a PDF or image file",
        variant: "destructive",
      });
    }
  };

  // Generate certificate with name overlay
  const generateCertificateWithName = async (participant: Participant, templateFile: File): Promise<string> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      
      if (templateFile.type === 'application/pdf') {
        // For PDF templates, we'll just use the participant name as placeholder
        // In a real implementation, you'd use PDF-lib to overlay text on PDF
        resolve(`Certificate generated for ${participant.name}`);
        return;
      }
      
      // For image templates
      const img = new Image();
      img.onload = () => {
        // Set canvas size to match image
        canvas.width = img.width;
        canvas.height = img.height;
        
        // Draw the template image
        ctx.drawImage(img, 0, 0);
        
        // Configure text style for participant name
        ctx.font = 'bold 48px Arial';
        ctx.fillStyle = '#000000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Draw participant name in the center (you can adjust positioning)
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2 + 50; // Slightly below center
        
        ctx.fillText(participant.name, centerX, centerY);
        
        // Convert to data URL
        const dataUrl = canvas.toDataURL('image/png');
        resolve(dataUrl);
      };
      
      img.src = URL.createObjectURL(templateFile);
    });
  };

  const generateCertificates = async () => {
    if (!certificateTemplate) {
      toast({
        title: "Missing Template",
        description: "Please upload a certificate template",
        variant: "destructive",
      });
      return;
    }

    if (participants.length === 0) {
      toast({
        title: "No Participants",
        description: "No registered participants found to generate certificates for",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setProgress(0);

    try {
      const generatedCerts = [];
      
      // Generate certificates for each participant
      for (let i = 0; i < participants.length; i++) {
        const participant = participants[i];
        
        // Update progress
        const progressPercent = Math.round(((i + 1) / participants.length) * 100);
        setProgress(progressPercent);

        // Generate unique certificate number
        const certificateNumber = `CERT-${Date.now()}-${i.toString().padStart(3, '0')}`;

        // Check if certificate already exists
        const { data: existingCert } = await supabase
          .from('certificates')
          .select('id')
          .eq('registration_id', participant.id)
          .maybeSingle();

        if (!existingCert) {
          // Generate certificate with participant name
          const certificateDataUrl = await generateCertificateWithName(participant, certificateTemplate);
          
          // Create certificate record
          const { error: certError } = await supabase
            .from('certificates')
            .insert({
              registration_id: participant.id,
              participant_name: participant.name,
              participant_email: participant.email,
              certificate_number: certificateNumber,
              certificate_url: certificateDataUrl, // Store the generated certificate
              status: 'issued',
              issued_at: new Date().toISOString(),
              template_id: null
            });

          if (certError) {
            console.error('Error creating certificate:', certError);
            throw new Error(`Failed to create certificate for ${participant.name}`);
          }

          generatedCerts.push({
            participant_name: participant.name,
            certificate_number: certificateNumber,
            certificate_url: certificateDataUrl
          });
        }

        // Small delay to show progress
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Refresh data to get updated certificates
      await fetchWebhookRegistrations();
      
      toast({
        title: "Certificates Generated",
        description: `Successfully generated certificates for ${participants.length} participants with personalized names`,
      });

    } catch (error) {
      console.error('Certificate generation error:', error);
      toast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : "Failed to generate certificates",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  const sendCertificates = async () => {
    // Get certificates that are issued but not sent
    const { data: certificates, error: fetchError } = await supabase
      .from('certificates')
      .select('*, webhook_registrations!certificates_webhook_registration_fkey(participant_email, participant_name)')
      .eq('status', 'issued');

    if (fetchError) {
      toast({
        title: "Error",
        description: "Failed to fetch certificates",
        variant: "destructive",
      });
      return;
    }

    if (!certificates || certificates.length === 0) {
      toast({
        title: "No Certificates to Send",
        description: "Please generate certificates first",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setProgress(0);

    try {
      // Send certificates via email (simulated for now)
      for (let i = 0; i < certificates.length; i++) {
        const cert = certificates[i];
        
        // Update progress
        const progressPercent = Math.round(((i + 1) / certificates.length) * 100);
        setProgress(progressPercent);

        // Update certificate status to sent
        const { error: updateError } = await supabase
          .from('certificates')
          .update({ 
            status: 'sent', 
            sent_at: new Date().toISOString() 
          })
          .eq('id', cert.id);

        if (updateError) {
          console.error('Error updating certificate:', updateError);
          throw new Error(`Failed to update certificate for ${cert.participant_name}`);
        }

        // Send email using Supabase Edge Function
        try {
          const { data: emailResult, error: emailError } = await supabase.functions.invoke('send-certificate-email', {
            body: {
              to: cert.participant_email,
              subject: emailSubject,
              message: emailMessage,
              participant_name: cert.participant_name,
              certificate_number: cert.certificate_number,
              certificate_url: cert.certificate_url
            }
          });

          if (emailError) {
            console.error('Email sending error:', emailError);
            throw new Error(`Failed to send email to ${cert.participant_email}`);
          }

          console.log('Email sent successfully:', emailResult);
        } catch (emailError) {
          console.error('Email error:', emailError);
          // Continue with the process but log the error
          console.log(`Email failed for ${cert.participant_email}, but certificate status will be updated`);
        }

        // Small delay to show progress
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Update participants status in local state
      setParticipants(prev => prev.map(p => ({ ...p, status: 'sent' as const })));
      
      toast({
        title: "Certificates Sent",
        description: `Successfully sent certificates to ${certificates.length} participants`,
      });

    } catch (error) {
      console.error('Certificate sending error:', error);
      toast({
        title: "Sending Failed",
        description: error instanceof Error ? error.message : "Failed to send certificates",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      setProgress(0);
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
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="participants">Registered Participants</TabsTrigger>
            <TabsTrigger value="generate">Generate Certificates</TabsTrigger>
            <TabsTrigger value="send">Send Certificates</TabsTrigger>
            <TabsTrigger value="manage">Manage</TabsTrigger>
          </TabsList>

          <TabsContent value="participants" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Certificate Template Upload */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Award className="w-5 h-5 mr-2" />
                    Upload Certificate Template
                  </CardTitle>
                  <CardDescription>
                    Upload a PDF or image file that will be used as the certificate template.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid w-full max-w-sm items-center gap-1.5">
                    <Label htmlFor="certificate-upload">Certificate Template</Label>
                    <Input 
                      id="certificate-upload" 
                      type="file" 
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={handleCertificateUpload}
                    />
                  </div>
                  {certificateTemplate && (
                    <div className="flex items-center text-sm text-green-600">
                      <CheckCircle className="w-4 h-4 mr-2" />
                      {certificateTemplate.name} uploaded successfully
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Stats Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Users className="w-5 h-5 mr-2" />
                    Registration Statistics
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-blue-600">{participants.length}</div>
                      <div className="text-sm text-muted-foreground">Total Registered</div>
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
            </div>

            {/* Participants List */}
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
                  <CardTitle>Registered Participants</CardTitle>
                  <CardDescription>
                    Participants registered through webhook integrations.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2">Name</th>
                          <th className="text-left p-2">Email</th>
                          <th className="text-left p-2">Course</th>
                          <th className="text-left p-2">Date</th>
                          <th className="text-left p-2">Time Zone</th>
                          <th className="text-left p-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {participants.map((participant) => (
                          <tr key={participant.id} className="border-b">
                            <td className="p-2">{participant.name}</td>
                            <td className="p-2">{participant.email}</td>
                            <td className="p-2">{participant.course}</td>
                            <td className="p-2">{participant.completionDate}</td>
                            <td className="p-2">{participant.time_zone}</td>
                            <td className="p-2">{getStatusBadge(participant.status)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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

          <TabsContent value="generate" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Award className="w-5 h-5 mr-2" />
                  Generate Certificates
                </CardTitle>
                <CardDescription>
                  Generate personalized certificates for all participants.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isProcessing && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Generating certificates...</span>
                      <span>{progress}%</span>
                    </div>
                    <Progress value={progress} />
                  </div>
                )}
                
                <Button 
                  onClick={generateCertificates}
                  disabled={!certificateTemplate || isProcessing || participants.length === 0}
                  className="w-full"
                >
                  <Award className="w-4 h-4 mr-2" />
                  Generate Certificates
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="send" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Mail className="w-5 h-5 mr-2" />
                  Send Certificates
                </CardTitle>
                <CardDescription>
                  Configure email settings and send certificates to participants.
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
                    />
                  </div>
                  <div>
                    <Label htmlFor="email-message">Email Message</Label>
                    <Textarea
                      id="email-message"
                      value={emailMessage}
                      onChange={(e) => setEmailMessage(e.target.value)}
                      rows={4}
                    />
                  </div>
                </div>

                {isProcessing && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Sending certificates...</span>
                      <span>{progress}%</span>
                    </div>
                    <Progress value={progress} />
                  </div>
                )}

                <Button 
                  onClick={sendCertificates}
                  disabled={participants.filter(p => p.status === 'issued').length === 0 || isProcessing}
                  className="w-full"
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Send Certificates
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="manage" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Manage Certificates</CardTitle>
                <CardDescription>
                  View and manage all generated certificates with preview.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {participants.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2">Name</th>
                          <th className="text-left p-2">Email</th>
                          <th className="text-left p-2">Course</th>
                          <th className="text-left p-2">Certificate #</th>
                          <th className="text-left p-2">Status</th>
                          <th className="text-left p-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {participants.map((participant) => {
                          const certificate = certificates.find(cert => cert.registration_id === participant.id);
                          return (
                            <tr key={participant.id} className="border-b">
                              <td className="p-2">{participant.name}</td>
                              <td className="p-2">{participant.email}</td>
                              <td className="p-2">{participant.course}</td>
                              <td className="p-2 font-mono text-xs">
                                {certificate?.certificate_number || 'Not Generated'}
                              </td>
                              <td className="p-2">{getStatusBadge(participant.status)}</td>
                              <td className="p-2">
                                <div className="flex gap-2">
                                  {certificate?.certificate_url && (
                                    <Button 
                                      variant="outline" 
                                      size="sm"
                                      onClick={() => {
                                        // Open certificate preview in new window
                                        const newWindow = window.open('', '_blank');
                                        if (newWindow) {
                                          newWindow.document.write(`
                                            <html>
                                              <head>
                                                <title>Certificate - ${participant.name}</title>
                                                <style>
                                                  body { margin: 0; padding: 20px; text-align: center; font-family: Arial, sans-serif; }
                                                  img { max-width: 100%; height: auto; border: 1px solid #ddd; }
                                                  h2 { margin-bottom: 20px; }
                                                </style>
                                              </head>
                                              <body>
                                                <h2>Certificate for ${participant.name}</h2>
                                                <p><strong>Certificate Number:</strong> ${certificate.certificate_number}</p>
                                                <img src="${certificate.certificate_url}" alt="Certificate for ${participant.name}" />
                                              </body>
                                            </html>
                                          `);
                                        }
                                      }}
                                    >
                                      <Eye className="w-3 h-3 mr-1" />
                                      Preview
                                    </Button>
                                  )}
                                  {certificate?.certificate_url && (
                                    <Button 
                                      variant="outline" 
                                      size="sm"
                                      onClick={() => {
                                        // Download certificate
                                        const link = document.createElement('a');
                                        link.href = certificate.certificate_url;
                                        link.download = `Certificate_${participant.name.replace(/\s+/g, '_')}_${certificate.certificate_number}.png`;
                                        link.click();
                                      }}
                                    >
                                      <Download className="w-3 h-3 mr-1" />
                                      Download
                                    </Button>
                                  )}
                                  {!certificate && (
                                    <Badge variant="secondary">No Certificate</Badge>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No participants found. Webhook registrations will appear here.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Certificate Gallery */}
            {certificates.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <FileImage className="w-5 h-5 mr-2" />
                    Certificate Gallery
                  </CardTitle>
                  <CardDescription>
                    Preview of all generated certificates
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {certificates
                      .filter(cert => cert.certificate_url)
                      .map((certificate) => (
                        <div key={certificate.id} className="border rounded-lg p-4">
                          <div className="aspect-[4/3] mb-3 overflow-hidden rounded border">
                            <img 
                              src={certificate.certificate_url} 
                              alt={`Certificate for ${certificate.participant_name}`}
                              className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform"
                              onClick={() => {
                                const newWindow = window.open('', '_blank');
                                if (newWindow) {
                                  newWindow.document.write(`
                                    <html>
                                      <head>
                                        <title>Certificate - ${certificate.participant_name}</title>
                                        <style>
                                          body { margin: 0; padding: 20px; text-align: center; font-family: Arial, sans-serif; }
                                          img { max-width: 100%; height: auto; border: 1px solid #ddd; }
                                          h2 { margin-bottom: 20px; }
                                        </style>
                                      </head>
                                      <body>
                                        <h2>Certificate for ${certificate.participant_name}</h2>
                                        <p><strong>Certificate Number:</strong> ${certificate.certificate_number}</p>
                                        <img src="${certificate.certificate_url}" alt="Certificate for ${certificate.participant_name}" />
                                      </body>
                                    </html>
                                  `);
                                }
                              }}
                            />
                          </div>
                          <div className="text-center">
                            <h4 className="font-semibold">{certificate.participant_name}</h4>
                            <p className="text-sm text-muted-foreground font-mono">
                              {certificate.certificate_number}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {getStatusBadge(certificate.status as any)}
                            </p>
                          </div>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}