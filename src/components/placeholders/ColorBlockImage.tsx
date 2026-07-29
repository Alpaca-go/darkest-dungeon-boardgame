interface ColorBlockImageProps {
  color?: string;
  label?: string;
  imageUrl?: string;
  className?: string;
}

/**
 * 可替换的视觉占位容器。第一阶段仅渲染纯色块；
 * 后续传入 imageUrl 即可无痛替换为正式图片，不改业务逻辑。
 */
export default function ColorBlockImage({
  color = '#463b34',
  label,
  imageUrl,
  className,
}: ColorBlockImageProps) {
  if (imageUrl) {
    return <img src={imageUrl} alt={label ?? ''} className={className} />;
  }
  return (
    <div
      className={['flex items-center justify-center text-xs font-semibold text-dd-text/90', className ?? ''].join(
        ' '
      )}
      style={{ backgroundColor: color }}
    >
      {label}
    </div>
  );
}
