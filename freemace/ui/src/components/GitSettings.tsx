import { useState, useEffect, useCallback } from 'react';
import {
  Box, Button, Flex, Heading, HStack, Input, Text, VStack,
} from '@chakra-ui/react';
import { useColorModeValue } from './ui/color-mode';
import { useToast } from './ui/toast';
import {
  GitBranch, Key, RefreshCw, Check,
  ExternalLink, Copy, Loader2, Shield, FolderGit2,
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL ?? '';

interface GitStatus {
  initialized: boolean;
  remote: string | null;
  ssh_key_exists: boolean;
  ssh_public_key: string;
  recent_commits: string[];
  dirty: boolean;
}

export default function GitSettings() {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [remote, setRemote] = useState('');
  const [loading, setLoading] = useState('');
  const [testResult, setTestResult] = useState<{ connected: boolean; output: string } | null>(null);
  const { toast } = useToast();

  const bg = useColorModeValue('white', '#1a1a2e');
  const cardBg = useColorModeValue('#f8f9fa', '#16213e');
  const border = useColorModeValue('#e2e8f0', '#2d3748');
  const mutedText = useColorModeValue('#718096', '#a0aec0');
  const keyBg = useColorModeValue('#edf2f7', '#0f3460');

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/git/status`);
      const data = await res.json();
      setStatus(data);
      if (data.remote) setRemote(data.remote);
    } catch {
      toast('error', 'Failed to fetch git status');
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const flash = toast;

  const generateKey = async () => {
    setLoading('key');
    setTestResult(null);
    try {
      const res = await fetch(`${API}/api/git/generate-key`, { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      flash('success', 'SSH key generated');
      await fetchStatus();
    } catch (e: any) {
      flash('error', e.message);
    } finally {
      setLoading('');
    }
  };

  const setupGit = async () => {
    if (!remote.trim()) {
      flash('error', 'Please enter a remote URL');
      return;
    }
    setLoading('setup');
    try {
      const res = await fetch(`${API}/api/git/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remote: remote.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      flash('success', `Git configured${data.commit ? ` — committed ${data.commit}` : ''}`);
      await fetchStatus();
    } catch (e: any) {
      flash('error', e.message);
    } finally {
      setLoading('');
    }
  };

  const testConnection = async () => {
    setLoading('test');
    setTestResult(null);
    try {
      const res = await fetch(`${API}/api/git/test`, { method: 'POST' });
      const data = await res.json();
      setTestResult(data);
      flash(data.connected ? 'success' : 'error',
        data.connected ? 'SSH connection successful' : `SSH connection failed: ${data.output}`);
    } catch (e: any) {
      setTestResult({ connected: false, output: e.message });
      flash('error', `Connection test failed: ${e.message}`);
    } finally {
      setLoading('');
    }
  };

  const triggerSync = async () => {
    setLoading('sync');
    try {
      const res = await fetch(`${API}/api/git/sync`, { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      flash('success', data.commit ? `Synced — ${data.commit}` : 'Nothing to commit');
      await fetchStatus();
    } catch (e: any) {
      flash('error', e.message);
    } finally {
      setLoading('');
    }
  };

  const copyKey = () => {
    if (status?.ssh_public_key) {
      navigator.clipboard.writeText(status.ssh_public_key);
      flash('success', 'Public key copied to clipboard');
    }
  };

  if (!status) {
    return (
      <Box p={6} bg={bg} minH="100vh">
        <Flex align="center" gap={2}><Loader2 className="spin" size={18} /> Loading...</Flex>
      </Box>
    );
  }

  return (
    <Box p={6} bg={bg} minH="100vh" maxW="800px" mx="auto">
      <Heading size="lg" mb={6}>
        <Flex align="center" gap={2}><FolderGit2 size={24} /> Git Backup</Flex>
      </Heading>

      {/* Step 1: SSH Key */}
      <Box bg={cardBg} p={5} borderRadius="lg" border="1px solid" borderColor={border} mb={4}>
        <Heading size="md" mb={3}>
          <Flex align="center" gap={2}>
            <Key size={18} />
            Step 1: SSH Key
            {status.ssh_key_exists && <Check size={16} color="green" />}
          </Flex>
        </Heading>
        <Text fontSize="sm" color={mutedText} mb={3}>
          An SSH key is used to securely push your data to GitHub without a password.
        </Text>

        {status.ssh_key_exists && status.ssh_public_key ? (
          <VStack align="stretch" gap={3}>
            <Box bg={keyBg} p={3} borderRadius="md" fontFamily="mono" fontSize="xs" position="relative">
              <Text wordBreak="break-all" pr={8}>{status.ssh_public_key}</Text>
              <Button
                size="xs" position="absolute" top={2} right={2}
                onClick={copyKey} variant="ghost"
              >
                <Copy size={14} />
              </Button>
            </Box>
            <HStack gap={2} flexWrap="wrap">
              <Button size="sm" onClick={generateKey} variant="outline"
                disabled={loading === 'key'}>
                {loading === 'key' ? <Loader2 className="spin" size={14} /> : <RefreshCw size={14} />}
                <Box ml={1}>Regenerate Key</Box>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <a href="https://github.com/settings/ssh/new" target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={14} />
                  <Box ml={1}>Add to GitHub</Box>
                </a>
              </Button>
            </HStack>
            <Text fontSize="xs" color={mutedText}>
              Copy the key above, then click "Add to GitHub" to open GitHub's SSH settings.
              Paste it there with the title "FreeMace Backup".
            </Text>
          </VStack>
        ) : (
          <Button onClick={generateKey} colorScheme="blue"
            disabled={loading === 'key'}>
            {loading === 'key' ? <Loader2 className="spin" size={14} /> : <Key size={14} />}
            <Box ml={2}>Generate SSH Key</Box>
          </Button>
        )}
      </Box>

      {/* Step 2: Test Connection */}
      {status.ssh_key_exists && (
        <Box bg={cardBg} p={5} borderRadius="lg" border="1px solid" borderColor={border} mb={4}>
          <Heading size="md" mb={3}>
            <Flex align="center" gap={2}>
              <Shield size={18} />
              Step 2: Test Connection
              {testResult?.connected && <Check size={16} color="green" />}
            </Flex>
          </Heading>
          <Text fontSize="sm" color={mutedText} mb={3}>
            Verify that GitHub accepts the SSH key. Make sure you've added it in GitHub first.
          </Text>

          <Button size="sm" onClick={testConnection}
            disabled={loading === 'test'}
            colorScheme={testResult?.connected ? 'green' : undefined}>
            {loading === 'test' ? <Loader2 className="spin" size={14} /> : <Shield size={14} />}
            <Box ml={1}>Test SSH Connection</Box>
          </Button>

          {testResult && (
            <Box mt={3} p={3} borderRadius="md" fontSize="xs" fontFamily="mono"
              bg={testResult.connected ? 'green.900' : 'red.900'} color="white">
              {testResult.output}
            </Box>
          )}
        </Box>
      )}

      {/* Step 3: Remote URL */}
      {status.ssh_key_exists && (
        <Box bg={cardBg} p={5} borderRadius="lg" border="1px solid" borderColor={border} mb={4}>
          <Heading size="md" mb={3}>
            <Flex align="center" gap={2}>
              <GitBranch size={18} />
              Step 3: GitHub Repository
              {status.initialized && status.remote && <Check size={16} color="green" />}
            </Flex>
          </Heading>
          <Text fontSize="sm" color={mutedText} mb={3}>
            Create a private repo on GitHub for your data, then paste the SSH URL below.
          </Text>

          <Flex gap={2} mb={3}>
            <Input
              flex={1}
              placeholder="git@github.com:username/freemace-data.git"
              value={remote}
              onChange={(e) => setRemote(e.target.value)}
              fontFamily="mono" fontSize="sm"
            />
            <Button onClick={setupGit} colorScheme="blue"
              disabled={loading === 'setup' || !remote.trim()}>
              {loading === 'setup' ? <Loader2 className="spin" size={14} /> : <GitBranch size={14} />}
              <Box ml={1}>{status.initialized ? 'Update' : 'Connect'}</Box>
            </Button>
          </Flex>

          <Button size="sm" variant="outline" asChild>
            <a href="https://github.com/new" target="_blank" rel="noopener noreferrer">
              <ExternalLink size={14} />
              <Box ml={1}>Create New Repo on GitHub</Box>
            </a>
          </Button>
        </Box>
      )}

      {/* Status / Recent Commits */}
      {status.initialized && (
        <Box bg={cardBg} p={5} borderRadius="lg" border="1px solid" borderColor={border}>
          <Heading size="md" mb={3}>
            <Flex align="center" gap={2}>
              <RefreshCw size={18} />
              Sync Status
            </Flex>
          </Heading>

          <HStack gap={3} mb={3}>
            <Text fontSize="sm">
              {status.dirty ? '● Uncommitted changes' : '● Clean'}
            </Text>
            <Button size="xs" onClick={triggerSync}
              disabled={loading === 'sync'}>
              {loading === 'sync' ? <Loader2 className="spin" size={14} /> : <RefreshCw size={14} />}
              <Box ml={1}>Sync Now</Box>
            </Button>
          </HStack>

          {status.recent_commits.length > 0 && (
            <Box>
              <Text fontSize="xs" fontWeight="bold" mb={1} color={mutedText}>Recent commits</Text>
              <Box fontFamily="mono" fontSize="xs" color={mutedText}>
                {status.recent_commits.map((c, i) => (
                  <Text key={i}>{c}</Text>
                ))}
              </Box>
            </Box>
          )}
        </Box>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </Box>
  );
}
