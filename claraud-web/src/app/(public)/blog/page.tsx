import { SectionWrapper } from '@/components/shared/section-wrapper';
import { getAllPosts } from '@/lib/blog';
import { ScanInput } from '@/components/scan/scan-input';
import { BlogGrid } from '@/components/blog/blog-grid';

export const metadata = {
  title: 'Blog | Claraud',
  description: 'Insights, guides, and data on local business marketing.',
};

export default function BlogIndex() {
  const posts = getAllPosts();

  return (
    <div className="bg-[#0a0a0f] min-h-screen pt-32 pb-20">
      <SectionWrapper>
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <h1 className="text-4xl md:text-6xl font-bold text-white mb-6">Blog</h1>
            <p className="text-text-secondary text-xl max-w-2xl mx-auto">
              Insights, guides, and data on local business marketing.
            </p>
          </div>

          <BlogGrid posts={posts} />

          <div className="mt-24 max-w-3xl mx-auto p-12 glass rounded-3xl border border-blue-500/20 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-600/5 to-transparent pointer-events-none" />
            <h3 className="text-2xl font-bold text-white mb-6 relative z-10">Get your free audit while you're here →</h3>
            <div className="max-w-md mx-auto relative z-10">
              <ScanInput variant="compact" />
            </div>
          </div>
        </div>
      </SectionWrapper>
    </div>
  );
}
