import { useState, useEffect, useCallback } from 'react';
import {
  Box, Button, Flex, Heading, HStack, Input, Text, VStack,
} from '@chakra-ui/react';
import { useColorModeValue } from './ui/color-mode';
import { useToast } from './ui/toast';
import {
  GitBranch, Key, RefreshCw, Check,
  ExternalLink, Copy, Loader2, Shield, FolderGit2,
  Download, Settings as SettingsIcon,
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

interface UpdateCheck {
  current: string;
  latest: string;
  update_available: boolean;
}

interface UpdateConfig {
  auto_update: boolean;
  update_interval_hours: number;
  current_version: string;
}

export default function Settings() {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [remote, setRemote] = useState('');
  const [loading, setLoading] = useState('');
  const [testResult, setTestResult] = useState<{ connected: boolean; output: string } | null>(null);
  const { toast } = useToast();

  const [updateCheck, setUpdateCheck] = useState<UpdateCheck | null>(null);
  const [updateCfg, setUpdateCfg] = useState<UpdateConfig | null>(null);
  const [updateResult, setUpdateResult] = useState<any>(null);

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

  const fetchUpdateInfo = useCallback(async () => {
    try {
      const [checkRes, cfgRes] = await Promise.all([
        fetch(`${API}/api/update/check`),
        fetch(`${API}/api/update/config`),
      ]);
      if (checkRes.ok) setUpdateCheck(await checkRes.json());
      if (cfgRes.ok) setUpdateCfg(await cfgRes.json());
    } catch { /* silently ignore */ }
  }, []);

  useEffect(() => { fetchStatus(); fetchUpdateInfo(); }, [fetchStatus, fetchUpdateInfo]);

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
        <Flex align="center" gap={2}><FolderGit2 size={24} /> Git Backup Settings</Flex>
      </Heading>

      {/* ── Step 1: SSH Key ─────────────────── */}
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
              <Button
                size="sm" variant="outline" asChild
              >
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

      {/* ── Step 2: Test Connection ───────── */}
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

      {/* ── Step 3: Remote URL ────────────── */}
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

      {/* ── Status / Recent Commits ───────── */}
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

      {/* ── Software Update ─────────────── */}
      <Box mt={8} mb={2}>
        <Heading size="lg" mb={6}>
          <Flex align="center" gap={2}><Download size={24} /> Software Update</Flex>
        </Heading>
      </Box>

      <Box bg={cardBg} p={5} borderRadius="lg" border="1px solid" borderColor={border} mb={4}>
        <Heading size="md" mb={3}>
          <Flex align="center" gap={2}>
            <SettingsIcon size={18} />
            Version & Updates
          </Flex>
        </Heading>

        {updateCheck && (
          <VStack align="stretch" gap={3}>
            <HStack gap={4}>
              <Box>
                <Text fontSize="xs" color={mutedText}>Installed</Text>
                <Text fontFamily="mono" fontWeight="bold">{updateCheck.current}</Text>
              </Box>
              <Box>
                <Text fontSize="xs" color={mutedText}>Latest on PyPI</Text>
                <Text fontFamily="mono" fontWeight="bold">{updateCheck.latest}</Text>
              </Box>
              {updateCheck.update_available ? (
                <Box px={2} py={1} bg="orange.500" color="white" borderRadius="md" fontSize="xs" fontWeight="bold">
                  Update available
                </Box>
              ) : (
                <Box px={2} py={1} bg="green.500" color="white" borderRadius="md" fontSize="xs" fontWeight="bold">
                  Up to date
                </Box>
              )}
            </HStack>

            <HStack gap={2} flexWrap="wrap">
              <Button size="sm" onClick={async () => {
                setLoading('check');
                await fetchUpdateInfo();
                setLoading('');
              }} variant="outline" disabled={loading === 'check'}>
                {loading === 'check' ? <Loader2 className="spin" size={14} /> : <RefreshCw size={14} />}
                <Box ml={1}>Check for Updates</Box>
              </Button>

              {updateCheck.update_available && (
                <Button size="sm" colorScheme="orange" onClick={async () => {
                  setLoading('update');
                  setUpdateResult(null);
                  try {
                    const res = await fetch(`${API}/api/update`, { method: 'POST' });
                    const data = await res.json();
                    setUpdateResult(data);
                    if (data.status === 'updated') {
                      flash('success', `Updated to ${data.to}${data.restarted ? ' — service restarting...' : ''}`);
                    } else if (data.status === 'error') {
                      flash('error', data.message);
                    } else {
                      flash('success', 'Already up to date');
                    }
                    await fetchUpdateInfo();
                  } catch (e: any) {
                    flash('error', e.message);
                  } finally {
                    setLoading('');
                  }
                }} disabled={loading === 'update'}>
                  {loading === 'update' ? <Loader2 className="spin" size={14} /> : <Download size={14} />}
                  <Box ml={1}>Install Update ({updateCheck.latest})</Box>
                </Button>
              )}
            </HStack>

            {updateResult && updateResult.status === 'updated' && (
              <Box p={3} borderRadius="md" bg="green.900" color="white" fontSize="sm">
                <Text>Updated from {updateResult.from} to {updateResult.to}</Text>
                {updateResult.restarted ? (
                  <Text fontSize="xs" mt={1}>Service is restarting. This page will reconnect shortly.</Text>
                ) : (
                  <Text fontSize="xs" mt={1}>Restart the service manually to use the new version.</Text>
                )}
                {updateResult.output && (
                  <Box mt={2} p={2} bg="blackAlpha.400" borderRadius="md" fontFamily="mono" fontSize="xs" whiteSpace="pre-wrap">
                    {updateResult.output}
                  </Box>
                )}
              </Box>
            )}

            {updateResult && updateResult.status === 'error' && (
              <Box p={3} borderRadius="md" bg="red.900" color="white" fontSize="sm">
                <Text fontWeight="bold">{updateResult.message}</Text>
                {updateResult.output && (
                  <Box mt={2} p={2} bg="blackAlpha.400" borderRadius="md" fontFamily="mono" fontSize="xs" whiteSpace="pre-wrap" maxH="300px" overflowY="auto">
                    {updateResult.output}
                  </Box>
                )}
              </Box>
            )}
          </VStack>
        )}

        {!updateCheck && (
          <Button size="sm" onClick={async () => {
            setLoading('check');
            await fetchUpdateInfo();
            setLoading('');
          }} disabled={loading === 'check'}>
            {loading === 'check' ? <Loader2 className="spin" size={14} /> : <RefreshCw size={14} />}
            <Box ml={1}>Check for Updates</Box>
          </Button>
        )}
      </Box>

      {/* ── Auto-Update Settings ──────────── */}
      {updateCfg && (
        <Box bg={cardBg} p={5} borderRadius="lg" border="1px solid" borderColor={border} mb={4}>
          <Heading size="md" mb={3}>
            <Flex align="center" gap={2}>
              <RefreshCw size={18} />
              Auto-Update
            </Flex>
          </Heading>
          <Text fontSize="sm" color={mutedText} mb={3}>
            When enabled, FreeMace will periodically check PyPI for new versions,
            install them, and restart the service automatically.
          </Text>

          <VStack align="stretch" gap={3}>
            <HStack gap={3}>
              <Button
                size="sm"
                colorScheme={updateCfg.auto_update ? 'green' : undefined}
                variant={updateCfg.auto_update ? 'solid' : 'outline'}
                onClick={async () => {
                  const newVal = !updateCfg.auto_update;
                  try {
                    const res = await fetch(`${API}/api/update/config`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ auto_update: newVal }),
                    });
                    if (res.ok) {
                      const data = await res.json();
                      setUpdateCfg(prev => prev ? { ...prev, ...data } : prev);
                      flash('success', newVal ? 'Auto-update enabled' : 'Auto-update disabled');
                    }
                  } catch (e: any) {
                    flash('error', e.message);
                  }
                }}
              >
                {updateCfg.auto_update ? <Check size={14} /> : null}
                <Box ml={updateCfg.auto_update ? 1 : 0}>
                  {updateCfg.auto_update ? 'Enabled' : 'Disabled'}
                </Box>
              </Button>
              <Text fontSize="sm" color={mutedText}>
                Check every
              </Text>
              <Input
                w="80px" size="sm" type="number" min={1} max={168}
                value={updateCfg.update_interval_hours}
                onChange={(e) => {
                  const v = parseInt(e.target.value) || 24;
                  setUpdateCfg(prev => prev ? { ...prev, update_interval_hours: v } : prev);
                }}
                onBlur={async () => {
                  try {
                    const res = await fetch(`${API}/api/update/config`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ update_interval_hours: updateCfg.update_interval_hours }),
                    });
                    if (res.ok) flash('success', `Update interval set to ${updateCfg.update_interval_hours}h`);
                  } catch (e: any) {
                    flash('error', `Failed to save interval: ${e.message}`);
                  }
                }}
              />
              <Text fontSize="sm" color={mutedText}>hours</Text>
            </HStack>
          </VStack>
        </Box>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </Box>
  );
}
