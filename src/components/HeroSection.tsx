import React from "react";
import { SparklesCore } from "@/components/ui/sparkles";
import { Button } from "@/components/ui/button";
import { Award, FileImage, Users, FileCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function HeroSection() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen relative w-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center overflow-hidden">
      {/* Background Sparkles */}
      <div className="w-full absolute inset-0 h-screen">
        <SparklesCore
          id="tsparticlesfullpage"
          background="transparent"
          minSize={0.6}
          maxSize={1.4}
          particleDensity={100}
          className="w-full h-full"
          particleColor="#3b82f6"
          speed={1}
        />
      </div>
      
      {/* Main Content */}
      <div className="relative z-20 text-center px-4 max-w-6xl mx-auto">
        {/* Logo/Brand */}
        <div className="flex items-center justify-center mb-8">
          <Award className="h-16 w-16 text-primary mr-4" />
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-white to-gray-300">
            Metascholar Institute
          </h1>
        </div>
        
        <h2 className="text-2xl md:text-3xl lg:text-4xl font-semibold text-white mb-4">
          Certification System
        </h2>
        
        <p className="text-lg md:text-xl text-gray-300 mb-8 max-w-3xl mx-auto leading-relaxed">
          Professional Certification Management System. Seamlessly issue, manage, and track 
          certificates for Metascholar Workshop participants and webinar completions.
        </p>

        {/* Feature Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 max-w-4xl mx-auto">
          <div className="flex flex-col items-center p-4 rounded-lg bg-white/10 backdrop-blur-sm border border-white/20">
            <FileCheck className="h-8 w-8 text-primary mb-2" />
            <h3 className="text-white font-semibold mb-1">Webhook Integration</h3>
            <p className="text-gray-300 text-sm text-center">Automatic participant registration via webhooks</p>
          </div>
          <div className="flex flex-col items-center p-4 rounded-lg bg-white/10 backdrop-blur-sm border border-white/20">
            <FileImage className="h-8 w-8 text-primary mb-2" />
            <h3 className="text-white font-semibold mb-1">Certificate Management</h3>
            <p className="text-gray-300 text-sm text-center">Upload and send PDF certificates individually</p>
          </div>
          <div className="flex flex-col items-center p-4 rounded-lg bg-white/10 backdrop-blur-sm border border-white/20">
            <Users className="h-8 w-8 text-primary mb-2" />
            <h3 className="text-white font-semibold mb-1">Bulk Communication</h3>
            <p className="text-gray-300 text-sm text-center">Send personalized emails with smart filtering</p>
          </div>
        </div>

        {/* CTA Button */}
        <Button 
          onClick={() => navigate('/certification')}
          size="lg"
          className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-4 text-lg font-semibold rounded-full shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
        >
          Access Certification Portal
        </Button>
      </div>

      {/* Gradient Overlays */}
      <div className="absolute inset-0 bg-gradient-to-t from-slate-900/50 to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900/30 to-transparent pointer-events-none" />
    </div>
  );
}