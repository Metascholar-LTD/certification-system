import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
  Send,
  Filter,
  UserCheck,
  Crown,
  Zap,
  MessageSquare,
  Target,
  Mail,
  FileText,
  Users,
  CheckCircle,
  RefreshCw
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Participant {
  id: string;
  name: string;
  email: string;
  course: string;
  completionDate: string;
  registration_type?: string;
  webinar_date: string;
  time_zone: string;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  content: string;
  target_audience: 'all' | 'free' | 'paid';
}

interface EmailParticipantsProps {
  participants: Participant[];
  isLoading: boolean;
}

export default function EmailParticipants({ participants, isLoading }: EmailParticipantsProps) {
  const { toast } = useToast();
  
  // Email system states
  const [selectedAudience, setSelectedAudience] = useState<'all' | 'free' | 'paid'>('all');
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [emailSubjectBulk, setEmailSubjectBulk] = useState('Important Update from Metascholar Institute');
  const [emailContentBulk, setEmailContentBulk] = useState('');
  const [isSendingBulk, setIsSendingBulk] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  
  const [emailTemplates] = useState<EmailTemplate[]>([
    {
      id: '1',
      name: 'Welcome Message',
      subject: 'Welcome to Metascholar Institute',
      content: 'Dear {{name}},\n\nWelcome to Metascholar Institute! We\'re excited to have you join our learning community.\n\nBest regards,\nMetascholar Team',
      target_audience: 'all'
    },
    {
      id: '2', 
      name: 'Workshop Reminder',
      subject: 'Reminder: Your upcoming workshop',
      content: 'Hi {{name}},\n\nThis is a friendly reminder about your upcoming workshop: {{course}}.\n\nDate: {{date}}\nTime Zone: {{timezone}}\n\nWe look forward to seeing you!\n\nBest regards,\nMetascholar Team',
      target_audience: 'all'
    }
  ]);

  // Email system functions
  const getFilteredParticipants = () => {
    if (selectedAudience === 'all') return participants;
    return participants.filter(p => p.registration_type === selectedAudience);
  };

  const handleTemplateSelect = (templateId: string) => {
    const template = emailTemplates.find(t => t.id === templateId);
    if (template) {
      setEmailSubjectBulk(template.subject);
      setEmailContentBulk(template.content);
      setSelectedTemplate(templateId);
    }
  };

  const replaceTemplateVariables = (content: string, participant: Participant) => {
    return content
      .replace(/\{\{name\}\}/g, participant.name)
      .replace(/\{\{course\}\}/g, participant.course)
      .replace(/\{\{date\}\}/g, participant.completionDate)
      .replace(/\{\{timezone\}\}/g, participant.time_zone)
      .replace(/\{\{email\}\}/g, participant.email);
  };

  const sendBulkEmails = async () => {
    setIsSendingBulk(true);
    
    try {
      const targetParticipants = selectedParticipants.length > 0 
        ? participants.filter(p => selectedParticipants.includes(p.id))
        : getFilteredParticipants();

      if (targetParticipants.length === 0) {
        toast({
          title: "No Recipients",
          description: "Please select participants or choose an audience filter",
          variant: "destructive",
        });
        return;
      }

      // Send emails in smaller batches to avoid overwhelming the server
      const batchSize = 5;
      const batches = [];
      for (let i = 0; i < targetParticipants.length; i += batchSize) {
        batches.push(targetParticipants.slice(i, i + batchSize));
      }

      let successful = 0;
      let failed = 0;

      for (const batch of batches) {
        const results = await Promise.allSettled(
          batch.map(async (participant) => {
            const personalizedContent = replaceTemplateVariables(emailContentBulk, participant);
            const personalizedSubject = replaceTemplateVariables(emailSubjectBulk, participant);
            
            // Determine email type based on template selection
            let emailType = 'custom';
            if (selectedTemplate === '1') emailType = 'welcome';
            else if (selectedTemplate === '2') emailType = 'reminder';

            const { error } = await supabase.functions.invoke('send-participant-email', {
              body: {
                to: participant.email,
                subject: personalizedSubject,
                content: personalizedContent,
                participant_name: participant.name,
                email_type: emailType
              }
            });

            if (error) throw error;
            return participant;
          })
        );

        successful += results.filter(r => r.status === 'fulfilled').length;
        failed += results.filter(r => r.status === 'rejected').length;

        // Add a small delay between batches
        if (batches.indexOf(batch) < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      toast({
        title: "Bulk Email Complete",
        description: `Successfully sent ${successful} emails${failed > 0 ? `, ${failed} failed` : ''}`,
      });

      // Clear selections
      setSelectedParticipants([]);
      
    } catch (error) {
      console.error('Bulk email error:', error);
      toast({
        title: "Sending Failed",
        description: "Failed to send bulk emails",
        variant: "destructive",
      });
    } finally {
      setIsSendingBulk(false);
    }
  };

  const toggleParticipantSelection = (participantId: string) => {
    setSelectedParticipants(prev => 
      prev.includes(participantId) 
        ? prev.filter(id => id !== participantId)
        : [...prev, participantId]
    );
  };

  const selectAllFiltered = () => {
    const filtered = getFilteredParticipants();
    setSelectedParticipants(filtered.map(p => p.id));
  };

  const clearSelection = () => {
    setSelectedParticipants([]);
  };

  const getRegistrationTypeBadge = (type: string) => {
    switch (type) {
      case 'free':
        return <Badge variant="outline"><UserCheck className="w-3 h-3 mr-1" />Free</Badge>;
      case 'paid':
        return <Badge variant="default" className="bg-gradient-to-r from-blue-500 to-purple-600"><Crown className="w-3 h-3 mr-1" />Premium</Badge>;
      default:
        return <Badge variant="secondary"><UserCheck className="w-3 h-3 mr-1" />Free</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Email System Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <MessageSquare className="w-5 h-5 mr-2" />
            Email Messaging System
          </CardTitle>
          <CardDescription>
            Send personalized emails to your registered participants with smart filtering and templates.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{participants.length}</div>
              <div className="text-sm text-blue-700">Total Participants</div>
            </div>
            <div className="p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-lg">
              <div className="text-2xl font-bold text-green-600">
                {participants.filter(p => p.registration_type === 'free').length}
              </div>
              <div className="text-sm text-green-700">Free Users</div>
            </div>
            <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">
                {participants.filter(p => p.registration_type === 'paid').length}
              </div>
              <div className="text-sm text-purple-700">Premium Users</div>
            </div>
            <div className="p-4 bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg">
              <div className="text-2xl font-bold text-orange-600">{selectedParticipants.length}</div>
              <div className="text-sm text-orange-700">Selected</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Audience & Template Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Target className="w-5 h-5 mr-2" />
              Audience & Templates
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Audience Filter */}
            <div>
              <Label className="text-sm font-medium">Target Audience</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                <Button
                  variant={selectedAudience === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedAudience('all')}
                >
                  <Users className="w-3 h-3 mr-1" />
                  All ({participants.length})
                </Button>
                <Button
                  variant={selectedAudience === 'free' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedAudience('free')}
                >
                  <UserCheck className="w-3 h-3 mr-1" />
                  Free ({participants.filter(p => p.registration_type === 'free').length})
                </Button>
                <Button
                  variant={selectedAudience === 'paid' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedAudience('paid')}
                >
                  <Crown className="w-3 h-3 mr-1" />
                  Premium ({participants.filter(p => p.registration_type === 'paid').length})
                </Button>
              </div>
            </div>

            {/* Email Templates */}
            <div>
              <Label className="text-sm font-medium">Email Templates</Label>
              <div className="space-y-2 mt-2">
                {emailTemplates.map((template) => (
                  <Button
                    key={template.id}
                    variant={selectedTemplate === template.id ? 'default' : 'outline'}
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => handleTemplateSelect(template.id)}
                  >
                    <FileText className="w-3 h-3 mr-2" />
                    {template.name}
                    <Badge variant="secondary" className="ml-auto">
                      {template.target_audience}
                    </Badge>
                  </Button>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={selectAllFiltered}>
                <Zap className="w-3 h-3 mr-1" />
                Select All Filtered
              </Button>
              <Button variant="outline" size="sm" onClick={clearSelection}>
                Clear Selection
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Email Composer */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Mail className="w-5 h-5 mr-2" />
              Compose Email
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="bulk-email-subject">Email Subject</Label>
              <Input
                id="bulk-email-subject"
                value={emailSubjectBulk}
                onChange={(e) => setEmailSubjectBulk(e.target.value)}
                placeholder="Enter email subject..."
              />
            </div>
            
            <div>
              <Label htmlFor="bulk-email-content">Email Content</Label>
              <Textarea
                id="bulk-email-content"
                value={emailContentBulk}
                onChange={(e) => setEmailContentBulk(e.target.value)}
                rows={8}
                placeholder="Enter your email content here...

Available variables:
{{name}} - Participant name
{{course}} - Course name
{{date}} - Course date
{{timezone}} - Time zone
{{email}} - Participant email"
              />
            </div>

            <Button 
              onClick={sendBulkEmails} 
              disabled={isSendingBulk || !emailSubjectBulk || !emailContentBulk}
              className="w-full"
            >
              {isSendingBulk ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Send to {selectedParticipants.length > 0 ? selectedParticipants.length : getFilteredParticipants().length} Recipients
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Participants List with Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center">
              <Users className="w-5 h-5 mr-2" />
              Participant Selection
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4" />
              <span className="text-sm text-muted-foreground">
                Showing {getFilteredParticipants().length} of {participants.length}
              </span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Loading participants...</p>
            </div>
          ) : getFilteredParticipants().length > 0 ? (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {getFilteredParticipants().map((participant) => (
                <div
                  key={participant.id}
                  className={`p-4 border rounded-lg cursor-pointer transition-all ${
                    selectedParticipants.includes(participant.id)
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => toggleParticipantSelection(participant.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <h4 className="font-semibold">{participant.name}</h4>
                          <p className="text-sm text-muted-foreground">{participant.email}</p>
                          <p className="text-xs text-muted-foreground">{participant.course}</p>
                        </div>
                        <div className="flex gap-2">
                          {getRegistrationTypeBadge(participant.registration_type || 'free')}
                        </div>
                      </div>
                    </div>
                    <div className="ml-4">
                      {selectedParticipants.includes(participant.id) ? (
                        <CheckCircle className="w-5 h-5 text-blue-500" />
                      ) : (
                        <div className="w-5 h-5 border-2 border-gray-300 rounded-full" />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No Participants Found</h3>
              <p className="text-muted-foreground">
                No participants match the selected filters.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}