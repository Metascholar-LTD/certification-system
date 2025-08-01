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
  RefreshCw
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

      // Transform webhook data to participant format
      const transformedParticipants: Participant[] = data.map((registration) => ({
        id: registration.id,
        registration_id: registration.registration_id,
        name: registration.participant_name,
        email: registration.participant_email,
        course: registration.webinar_title,
        completionDate: new Date(registration.webinar_date).toLocaleDateString(),
        webinar_date: registration.webinar_date,
        time_zone: registration.time_zone,
        status: 'pending' as const
      }));

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

    // Simulate certificate generation process
    for (let i = 0; i <= 100; i += 10) {
      setProgress(i);
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Update participants status
    setParticipants(prev => prev.map(p => ({ ...p, status: 'issued' as const })));
    
    setIsProcessing(false);
    toast({
      title: "Certificates Generated",
      description: `Successfully generated certificates for ${participants.length} participants`,
    });
  };

  const sendCertificates = async () => {
    const issuedParticipants = participants.filter(p => p.status === 'issued');
    if (issuedParticipants.length === 0) {
      toast({
        title: "No Certificates to Send",
        description: "Please generate certificates first",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setProgress(0);

    // Simulate email sending process
    for (let i = 0; i <= 100; i += 20) {
      setProgress(i);
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    // Update participants status
    setParticipants(prev => prev.map(p => 
      p.status === 'issued' ? { ...p, status: 'sent' as const } : p
    ));
    
    setIsProcessing(false);
    toast({
      title: "Certificates Sent",
      description: `Successfully sent certificates to ${issuedParticipants.length} participants`,
    });
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
                  View and manage all generated certificates.
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
                          <th className="text-left p-2">Completion Date</th>
                          <th className="text-left p-2">Status</th>
                          <th className="text-left p-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {participants.map((participant) => (
                          <tr key={participant.id} className="border-b">
                            <td className="p-2">{participant.name}</td>
                            <td className="p-2">{participant.email}</td>
                            <td className="p-2">{participant.course}</td>
                            <td className="p-2">{participant.completionDate}</td>
                            <td className="p-2">{getStatusBadge(participant.status)}</td>
                            <td className="p-2">
                              <Button variant="outline" size="sm">
                                <Download className="w-3 h-3 mr-1" />
                                Download
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No participants uploaded yet. Please upload a CSV file first.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}