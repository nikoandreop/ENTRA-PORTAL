import { useQuery } from '@tanstack/react-query';
import { getAgents } from '@/services/agents';
import { statusColor, timeAgo } from '@/utils/formatters';
import { cn } from '@/utils/cn';
import { Server, Wifi, WifiOff, Cpu, HardDrive } from 'lucide-react';

export function AgentListPage() {
  const { data: agents, isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: getAgents,
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Agents</h1>
        <p className="text-sm text-gray-500">Monitor tenant agent health and connectivity</p>
      </div>

      {isLoading ? (
        <div className="text-center text-gray-500 py-12">Loading agents...</div>
      ) : !agents || agents.length === 0 ? (
        <div className="card text-center py-12">
          <Server className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-4 text-gray-500">No agents connected</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {agents.map((agent: any) => (
            <div key={agent.agentId} className="card">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  {agent.status === 'connected' ? (
                    <Wifi className="h-5 w-5 text-green-500" />
                  ) : (
                    <WifiOff className="h-5 w-5 text-red-500" />
                  )}
                  <div>
                    <h3 className="font-semibold text-gray-900">{agent.tenantName}</h3>
                    <p className="text-xs text-gray-500">{agent.tenantDomain}</p>
                  </div>
                </div>
                <span className={cn('badge', statusColor(agent.status))}>{agent.status}</span>
              </div>

              <div className="grid grid-cols-2 gap-3 border-t pt-3 text-sm">
                <div>
                  <p className="text-xs text-gray-500">Hostname</p>
                  <p className="font-mono text-gray-700 text-xs">{agent.hostname}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Version</p>
                  <p className="text-gray-700">{agent.version}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Last Heartbeat</p>
                  <p className="text-gray-700">{timeAgo(agent.lastHeartbeat)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Connected Since</p>
                  <p className="text-gray-700">{timeAgo(agent.connectedAt)}</p>
                </div>
              </div>

              {agent.metrics && (
                <div className="flex gap-4 border-t pt-3 mt-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><Cpu className="h-3 w-3" /> {agent.metrics.cpuUsage}% CPU</span>
                  <span className="flex items-center gap-1"><HardDrive className="h-3 w-3" /> {agent.metrics.memoryUsageMb}MB RAM</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
