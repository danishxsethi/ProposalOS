import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ArrowLeft, Clock, User } from 'lucide-react';
import { MDXRemote } from 'next-mdx-remote/rsc';

import { ScanInput } from '@/components/scan/scan-input';
import { JsonLd } from '@/components/shared/json-ld';
import { SectionWrapper } from '@/components/shared/section-wrapper';
import { Badge } from '@/components/ui/badge';
import { getAllPosts, getPostBySlug } from '@/lib/blog';

export async function generateStaticParams() {
  const posts = getAllPosts();
  return posts.map((post) => ({
    slug: post.slug,
  }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};
  return {
    title: `${post.title} | Claraud Blog`,
    description: post.description,
  };
}

const components = {
  h1: (props: any) => (
    <h1 className="text-3xl md:text-4xl font-bold text-white mb-6 mt-12" {...props} />
  ),
  h2: (props: any) => (
    <h2 className="text-2xl md:text-3xl font-bold text-white mb-4 mt-10" {...props} />
  ),
  h3: (props: any) => (
    <h3 className="text-xl md:text-2xl font-bold text-white mb-4 mt-8" {...props} />
  ),
  p: (props: any) => <p className="text-text-secondary text-lg leading-relaxed mb-6" {...props} />,
  ul: (props: any) => (
    <ul className="list-disc list-inside mb-6 space-y-2 text-text-secondary" {...props} />
  ),
  ol: (props: any) => (
    <ol className="list-decimal list-inside mb-6 space-y-2 text-text-secondary" {...props} />
  ),
  li: (props: any) => <li className="text-lg" {...props} />,
  blockquote: (props: any) => (
    <blockquote
      className="border-l-4 border-blue-500 pl-6 py-2 italic bg-blue-500/5 rounded-r-xl mb-6 text-white"
      {...props}
    />
  ),
  code: (props: any) => (
    <code
      className="bg-white/10 rounded px-1.5 py-0.5 text-blue-400 font-mono text-sm"
      {...props}
    />
  ),
  pre: (props: any) => (
    <pre
      className="bg-[#0d1117] p-6 rounded-2xl border border-white/10 overflow-x-auto mb-8 font-mono text-sm"
      {...props}
    />
  ),
  strong: (props: any) => <strong className="text-white font-bold" {...props} />,
  a: (props: any) => (
    <Link
      className="text-blue-400 hover:text-blue-300 underline transition-colors"
      {...props}
      href={props.href || '#'}
    />
  ),
  ScanCTA: () => (
    <div className="my-12 p-8 glass rounded-3xl border border-blue-500/30 text-center">
      <h3 className="text-xl font-bold text-white mb-4">Want to know your exact score?</h3>
      <p className="text-text-secondary mb-6">Run a free 30-second audit of your business.</p>
      <ScanInput variant="compact" />
    </div>
  ),
};

export default async function BlogPost({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    author: {
      '@type': 'Person',
      name: post.author,
    },
    datePublished: post.date,
    image: post.image || 'https://claraud.com/blog-placeholder.png',
    publisher: {
      '@type': 'Organization',
      name: 'Claraud',
      logo: {
        '@type': 'ImageObject',
        url: 'https://claraud.com/logo.png',
      },
    },
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Blog',
        item: 'https://claraud.com/blog',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: post.title,
        item: `https://claraud.com/blog/${post.slug}`,
      },
    ],
  };

  const allPosts = getAllPosts();
  const relatedPosts = allPosts.filter((p) => p.slug !== post.slug).slice(0, 2);

  return (
    <div className="bg-[#0a0a0f] min-h-screen pt-32 pb-20">
      <JsonLd data={articleSchema} />
      <JsonLd data={breadcrumbSchema} />

      <SectionWrapper>
        <div className="max-w-3xl mx-auto px-4">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-text-secondary hover:text-white transition-colors mb-12 group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Back to Blog
          </Link>

          <div className="flex items-center gap-4 mb-6">
            <Badge className="bg-blue-600 text-white border-none">{post.category}</Badge>
            <div className="flex items-center gap-1.5 text-xs font-bold text-text-secondary uppercase tracking-widest">
              <Clock className="w-3 h-3" />
              <span>{post.readingTime}</span>
            </div>
          </div>

          <h1 className="text-4xl md:text-5xl font-bold text-white mb-8 leading-tight">
            {post.title}
          </h1>

          <div className="flex items-center gap-6 pb-8 border-b border-white/10 mb-12">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold">
                {post.author.charAt(0)}
              </div>
              <div>
                <p className="text-white text-sm font-bold">{post.author}</p>
                <p className="text-text-secondary text-xs">{post.date}</p>
              </div>
            </div>
          </div>

          <article className="prose prose-invert max-w-none">
            <MDXRemote source={post.content} components={components} />
          </article>

          {/* Related Posts */}
          {relatedPosts.length > 0 && (
            <div className="mt-24 pt-16 border-t border-white/10">
              <h2 className="text-2xl font-bold text-white mb-8">Related Posts</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {relatedPosts.map((p) => (
                  <Link key={p.slug} href={`/blog/${p.slug}`} className="group">
                    <div className="glass rounded-2xl p-6 border border-white/10 hover:border-blue-500/30 transition-all h-full">
                      <h3 className="text-lg font-bold text-white mb-2 group-hover:text-blue-400 transition-colors line-clamp-2">
                        {p.title}
                      </h3>
                      <p className="text-text-secondary text-sm line-clamp-2">{p.description}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Bottom CTA */}
          <div className="mt-24 p-12 glass rounded-3xl border border-blue-500/20 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-600/5 to-transparent pointer-events-none" />
            <h3 className="text-2xl font-bold text-white mb-4 relative z-10">
              Found this helpful?
            </h3>
            <p className="text-text-secondary mb-8 relative z-10 text-lg">
              Scan your business for free and get actionable insights in 30 seconds.
            </p>
            <div className="max-w-md mx-auto relative z-10">
              <ScanInput />
            </div>
          </div>
        </div>
      </SectionWrapper>
    </div>
  );
}
