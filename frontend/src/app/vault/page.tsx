'use client';

/**
 * Content Vault Page — Upload source videos
 */
    import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import Sidebar from '@/components/Sidebar';
import { useAuth } from '@/context/AuthContext';
import { fetchVideoAssets, uploadVideo } from '@/lib/api';

export default function VaultPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace('/login');
  }, [isAuthenticated, isLoading, router]);

  const { data: assetsData, isLoading: isLoadingAssets } = useQuery({
    queryKey: ['assets'],
    queryFn: () => fetchVideoAssets(1),
    enabled: isAuthenticated,
    refetchInterval: 5000,
  });

  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!selectedFile) throw new Error('No file selected');
      return uploadVideo(title, selectedFile);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      setTitle('');
      setSelectedFile(null);
    },
  });

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Sidebar />
      <main className="md:ml-64 pb-20 md:pb-8 p-4 md:p-8">
        <div className="max-w-3xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white">Content Vault</h1>
            <p className="text-gray-500 mt-1">
              Upload official source videos for DNA fingerprinting
            </p>
          </div>

          <div className="glass-card p-8 mb-8">
            <div className="space-y-6">
              {/* Title */}
              <div>
                <label htmlFor="vault-title" className="block text-sm font-medium text-gray-400 mb-2">
                  Video Title
                </label>
                <input
                  id="vault-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="input-field"
                  placeholder="e.g. Premier League Highlights — Week 32"
                />
              </div>

              {/* File Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Video File (MP4, max 500MB)
                </label>
                <div
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`
                    border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-300
                    ${dragActive
                      ? 'border-brand-400 bg-brand-500/10'
                      : selectedFile
                        ? 'border-green-500/30 bg-green-500/5'
                        : 'border-white/10 hover:border-brand-500/30 hover:bg-white/[0.02]'
                    }
                  `}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/mp4"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && setSelectedFile(e.target.files[0])}
                  />
                  {selectedFile ? (
                    <div className="animate-fade-in">
                      <div className="text-4xl mb-3">🎬</div>
                      <p className="text-green-400 font-semibold">{selectedFile.name}</p>
                      <p className="text-sm text-gray-500 mt-1">
                        {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
                      </p>
                      <p className="text-xs text-gray-600 mt-3">Click to change file</p>
                    </div>
                  ) : (
                    <div>
                      <div className="text-4xl mb-3">📁</div>
                      <p className="text-gray-400 font-medium">
                        Drag & drop your MP4 file here
                      </p>
                      <p className="text-sm text-gray-600 mt-1">or click to browse</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Success Message */}
              {uploadMutation.isSuccess && (
                <div className="px-4 py-3 bg-green-500/10 border border-green-500/20 rounded-xl text-sm text-green-400 animate-fade-in">
                  ✓ Video uploaded successfully! DNA extraction has been queued.
                </div>
              )}

              {/* Error */}
              {uploadMutation.isError && (
                <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400 animate-fade-in">
                  Upload failed: {((uploadMutation.error as any).response?.data?.title?.[0]) || ((uploadMutation.error as any).response?.data?.error) || (uploadMutation.error as Error).message}
                </div>
              )}

              {/* Submit */}
              <button
                onClick={() => uploadMutation.mutate()}
                disabled={!title || !selectedFile || uploadMutation.isPending}
                className="btn-primary w-full flex items-center justify-center gap-2 !py-3"
              >
                {uploadMutation.isPending ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Uploading & Extracting DNA...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                    Upload to Vault & Extract DNA
                  </>
                )}
              </button>
            </div>
          </div>
          
          <div className="mb-4">
            <h2 className="text-xl font-bold text-white">Vault Asset Library</h2>
            <p className="text-gray-500 text-sm mt-1">Recently uploaded official source videos</p>
          </div>
          
          <div className="glass-card overflow-hidden">
            {isLoadingAssets ? (
              <div className="p-8 text-center text-gray-500">Loading assets...</div>
            ) : assetsData?.results?.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No official source videos in vault yet.</div>
            ) : (
              <table className="w-full text-left text-sm text-gray-400">
                <thead className="text-xs uppercase bg-white/5 text-gray-300">
                  <tr>
                    <th scope="col" className="px-6 py-4 font-semibold w-16">ID</th>
                    <th scope="col" className="px-6 py-4 font-semibold">Title & AI Keywords</th>
                    <th scope="col" className="px-6 py-4 font-semibold">Upload Date</th>
                    <th scope="col" className="px-6 py-4 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {assetsData?.results?.map((asset: any) => (
                    <tr key={asset.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4 text-white font-medium">#{asset.id}</td>
                      <td className="px-6 py-4">
                        <p className="text-gray-300 mb-2">{asset.title}</p>
                        {asset.search_keywords ? (
                          <div className="flex flex-wrap gap-1.5">
                            {asset.search_keywords.split(',').map((kw: string, i: number) => (
                              <span key={i} className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-brand-500/10 text-brand-400 border border-brand-500/20 shadow-[0_0_8px_rgba(var(--brand-500-rgb),0.1)] hover:bg-brand-500/20 transition-colors">
                                {kw.trim()}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-600 italic">No keywords extracted</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">{new Date(asset.upload_date).toLocaleDateString()}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium border
                          ${asset.processing_status === 'Completed' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 
                            asset.processing_status === 'Failed' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                            'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'}`}>
                          {asset.processing_status.replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
