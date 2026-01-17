import { Check, X, Edit, Clock, Mail, Calendar, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ProposedAction } from '@/types/ops';

interface ProposalCardProps {
  proposal: ProposedAction;
  onApprove: (id: string) => void;
  onDecline: (id: string) => void;
  onEdit: (id: string) => void;
}

const actionIcons = {
  email_draft: Mail,
  calendar_event: Calendar,
  notion_page: FileText,
  generic: FileText,
};

const confidenceColors = {
  low: 'bg-red-100 text-red-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-green-100 text-green-800',
};

function getConfidenceLevel(confidence: number): 'low' | 'medium' | 'high' {
  if (confidence < 30) return 'low';
  if (confidence < 70) return 'medium';
  return 'high';
}

export function ProposalCard({ proposal, onApprove, onDecline, onEdit }: ProposalCardProps) {
  const Icon = actionIcons[proposal.action_type] || FileText;
  const confidenceLevel = getConfidenceLevel(proposal.confidence);
  const isPending = proposal.status === 'pending';

  return (
    <Card className={cn(
      'transition-all',
      !isPending && 'opacity-60'
    )}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">{proposal.title}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={confidenceColors[confidenceLevel]}>
              {proposal.confidence}%
            </Badge>
            {proposal.risk_level !== 'low' && (
              <Badge variant="destructive">{proposal.risk_level} risk</Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pb-2">
        <p className="text-sm text-muted-foreground">{proposal.summary}</p>
        {proposal.draft_content && (
          <div className="mt-2 p-2 bg-muted rounded text-sm font-mono whitespace-pre-wrap max-h-32 overflow-auto">
            {proposal.draft_content.substring(0, 200)}
            {proposal.draft_content.length > 200 && '...'}
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-2">
        {isPending ? (
          <div className="flex gap-2 w-full">
            <Button
              size="sm"
              variant="primary"
              className="flex-1"
              onClick={() => onApprove(proposal.id)}
            >
              <Check className="h-4 w-4 mr-1" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onEdit(proposal.id)}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDecline(proposal.id)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            {proposal.status === 'approved' ? 'Approved' : 'Declined'}
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
