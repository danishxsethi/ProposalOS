import { BlogGrid } from '@/components/blog/blog-grid';
import { SectionWrapper } from '@/components/shared/section-wrapper';
import { getAllPosts } from '@/lib/blog';

export const metadata = {
  title: 'Blog | Claraud',
  description: 'Practical notes on evidence-based website review.',
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
              Practical notes on evidence, scope, and careful website review.
            </p>
          </div>

          <BlogGrid posts={posts} />

          <p className="mt-16 text-center text-text-secondary">
            Public self-service scan intake is paused while request and browser network safeguards
            are qualified.
          </p>
        </div>
      </SectionWrapper>
    </div>
  );
}
